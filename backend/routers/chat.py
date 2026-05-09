"""
Chat router.
Handles all four advisor domains: grant, tax, contract, operations.
"""

from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from models.schemas import (
    ConversationCreate, ConversationResponse,
    MessageCreate, MessageResponse, ChatResponse,
    AdvisorDomain,
)
from utils.supabase_client import get_supabase
from utils.auth import get_current_user
from prompts.system_prompts import build_system_prompt
from services.gemini_service import chat_with_advisor
from services.document_service import extract_text_from_upload, infer_contract_type
from typing import Optional
import logging
import json

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

HISTORY_LIMIT = 20  # messages to include in context window


def _get_profile(supabase, user_id: str) -> dict | None:
    result = supabase.table("business_profiles").select("*").eq(
        "user_id", user_id
    ).maybe_single().execute()
    return result.data


def _get_conversation_history(supabase, conversation_id: str) -> list[dict]:
    """Fetch recent messages for context window."""
    result = supabase.table("messages").select(
        "role, content"
    ).eq("conversation_id", conversation_id).order(
        "created_at", desc=True
    ).limit(HISTORY_LIMIT).execute()

    # Reverse to chronological order
    messages = list(reversed(result.data or []))
    return messages


# ============================================================
# CONVERSATIONS CRUD
# ============================================================

@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(
    domain: Optional[AdvisorDomain] = None,
    user: dict = Depends(get_current_user),
):
    """List all conversations, optionally filtered by domain."""
    supabase = get_supabase()
    query = supabase.table("conversations").select("*").eq(
        "user_id", user["user_id"]
    ).eq("is_archived", False).order("updated_at", desc=True)

    if domain:
        query = query.eq("domain", domain)

    result = query.execute()
    return result.data or []


@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    user: dict = Depends(get_current_user),
):
    """Start a new conversation in a specific advisor domain."""
    supabase = get_supabase()
    result = supabase.table("conversations").insert({
        "user_id": user["user_id"],
        "domain": data.domain,
        "language": data.language,
        "title": data.title,
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create conversation.")

    return result.data[0]


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    """Get all messages in a conversation."""
    supabase = get_supabase()

    # Verify ownership
    conv = supabase.table("conversations").select("user_id").eq(
        "id", conversation_id
    ).single().execute()

    if not conv.data or conv.data["user_id"] != user["user_id"]:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    result = supabase.table("messages").select("*").eq(
        "conversation_id", conversation_id
    ).order("created_at").execute()

    return result.data or []


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
):
    """Archive (soft-delete) a conversation."""
    supabase = get_supabase()
    supabase.table("conversations").update({"is_archived": True}).eq(
        "id", conversation_id
    ).eq("user_id", user["user_id"]).execute()


# ============================================================
# MAIN CHAT ENDPOINT
# ============================================================

@router.post("/conversations/{conversation_id}/messages", response_model=ChatResponse)
async def send_message(
    conversation_id: str,
    data: MessageCreate,
    user: dict = Depends(get_current_user),
):
    """
    Send a message to the advisor and get a response.
    The domain is determined by the conversation's domain setting.
    """
    supabase = get_supabase()

    # Verify conversation ownership and get domain
    conv_result = supabase.table("conversations").select("*").eq(
        "id", conversation_id
    ).eq("user_id", user["user_id"]).single().execute()

    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    conversation = conv_result.data
    domain = conversation["domain"]
    language = data.language or conversation.get("language", "en")

    # Load business profile
    profile = _get_profile(supabase, user["user_id"])

    # Load conversation history
    history = _get_conversation_history(supabase, conversation_id)

    # Build system prompt
    system_prompt = build_system_prompt(domain=domain, profile=profile, language=language)

    # Store user message
    user_msg_result = supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "user_id": user["user_id"],
        "role": "user",
        "content": data.content,
        "document_filename": data.document_filename,
    }).execute()

    if not user_msg_result.data:
        raise HTTPException(status_code=500, detail="Failed to store message.")

    # Call Gemini
    try:
        ai_response = await chat_with_advisor(
            system_prompt=system_prompt,
            user_message=data.content,
            conversation_history=history,
            domain=domain,
            document_text=data.document_text,
        )
    except Exception as e:
        logger.error(f"Gemini error in conversation {conversation_id}: {e}")
        raise HTTPException(
            status_code=503,
            detail="AI advisor temporarily unavailable. Please try again.",
        )

    # Store assistant message
    assistant_msg_result = supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "user_id": user["user_id"],
        "role": "assistant",
        "content": ai_response["content"],
        "sources_cited": json.dumps(ai_response.get("sources_cited", [])),
        "document_filename": data.document_filename,
    }).execute()

    if not assistant_msg_result.data:
        raise HTTPException(status_code=500, detail="Failed to store response.")

    # Auto-generate conversation title from first exchange
    if len(history) == 0 and not conversation.get("title"):
        title = data.content[:60] + ("..." if len(data.content) > 60 else "")
        supabase.table("conversations").update({"title": title}).eq(
            "id", conversation_id
        ).execute()

    msg = assistant_msg_result.data[0]
    if isinstance(msg.get('sources_cited'), str):
        import json as _json
        msg['sources_cited'] = _json.loads(msg['sources_cited'])

    return ChatResponse(
        message=msg,
        conversation_id=conversation_id,
    )


# ============================================================
# DOCUMENT UPLOAD FOR CONTRACT ANALYSIS
# ============================================================

@router.post("/conversations/{conversation_id}/upload-document", response_model=ChatResponse)
async def upload_document(
    conversation_id: str,
    file: UploadFile = File(...),
    question: str = Form(default="Please analyze this contract."),
    language: str = Form(default="en"),
    user: dict = Depends(get_current_user),
):
    """
    Upload a contract/document for analysis.
    Extracts text, runs contract analysis, stores result.
    """
    supabase = get_supabase()

    # Verify conversation
    conv_result = supabase.table("conversations").select("*").eq(
        "id", conversation_id
    ).eq("user_id", user["user_id"]).single().execute()

    if not conv_result.data:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    if conv_result.data["domain"] != "contract":
        raise HTTPException(
            status_code=400,
            detail="Document upload is only available in the Contract advisor.",
        )

    # Read and validate file
    if file.size and file.size > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=413, detail="File too large. Maximum 10MB.")

    file_bytes = await file.read()
    content_type = file.content_type or "application/octet-stream"

    # Extract text
    extraction = extract_text_from_upload(file_bytes, file.filename or "document", content_type)

    if not extraction["success"]:
        raise HTTPException(
            status_code=422,
            detail=f"Could not read document: {extraction.get('error', 'Unknown error')}",
        )

    if not extraction["text"].strip():
        raise HTTPException(
            status_code=422,
            detail="Document appears to be empty or image-only (scanned PDF). Please upload a text-based PDF.",
        )

    contract_type = infer_contract_type(extraction["text"])
    truncation_note = " (Note: document was truncated to fit analysis limits.)" if extraction["truncated"] else ""

    # Build message with document context
    user_message = f"{question}{truncation_note}"

    profile = _get_profile(supabase, user["user_id"])
    history = _get_conversation_history(supabase, conversation_id)
    system_prompt = build_system_prompt(domain="contract", profile=profile, language=language)

    # Store user message
    supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "user_id": user["user_id"],
        "role": "user",
        "content": user_message,
        "document_filename": file.filename,
        "document_summary": f"Uploaded {contract_type} ({extraction['page_count']} pages, {extraction['char_count']} chars)",
    }).execute()

    # Run AI analysis
    try:
        ai_response = await chat_with_advisor(
            system_prompt=system_prompt,
            user_message=user_message,
            conversation_history=history,
            domain="contract",
            document_text=extraction["text"],
        )
    except Exception as e:
        logger.error(f"Contract analysis error: {e}")
        raise HTTPException(status_code=503, detail="Analysis temporarily unavailable.")

    # Store assistant response
    assistant_result = supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "user_id": user["user_id"],
        "role": "assistant",
        "content": ai_response["content"],
        "sources_cited": json.dumps(ai_response.get("sources_cited", [])),
        "document_filename": file.filename,
    }).execute()

    return ChatResponse(
        message=assistant_result.data[0],
        conversation_id=conversation_id,
    )