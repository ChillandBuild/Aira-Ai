from pydantic import BaseModel, field_validator
from typing import Optional, Literal
from datetime import datetime
from uuid import UUID

# --- Enums as Literals ---
SourceType = Literal["whatsapp", "instagram", "upload"]
SegmentType = Literal["A", "B", "C", "D"]
DirectionType = Literal["inbound", "outbound"]
OutcomeType = Literal["converted", "callback", "not_interested", "no_answer"]
PlatformType = Literal["instagram", "facebook", "google"]

# --- Lead Models ---
class LeadBase(BaseModel):
    phone: Optional[str] = None
    name: Optional[str] = None
    source: SourceType
    score: int = 5
    segment: SegmentType = "C"
    notes: Optional[str] = None
    ai_enabled: bool = True
    needs_human_intervention: bool = False
    converted_at: Optional[datetime] = None

    @field_validator("score")
    @classmethod
    def score_must_be_1_to_10(cls, v):
        if not 1 <= v <= 10:
            raise ValueError("score must be between 1 and 10")
        return v

class LeadCreate(LeadBase):
    pass

class LeadUpdate(BaseModel):
    name: Optional[str] = None
    score: Optional[int] = None
    segment: Optional[SegmentType] = None
    notes: Optional[str] = None
    needs_human_intervention: Optional[bool] = None

class Lead(LeadBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

# --- Message Models ---
class MessageBase(BaseModel):
    content: str
    direction: DirectionType
    channel: str = "whatsapp"
    is_ai_generated: bool = False
    twilio_message_sid: Optional[str] = None

class MessageCreate(MessageBase):
    lead_id: UUID
    conversation_id: Optional[UUID] = None

class Message(MessageBase):
    id: UUID
    lead_id: UUID
    conversation_id: Optional[UUID] = None
    created_at: datetime
    model_config = {"from_attributes": True}

# --- Conversation Models ---
class ConversationBase(BaseModel):
    channel: str = "whatsapp"
    status: Literal["active", "closed"] = "active"

class ConversationCreate(ConversationBase):
    lead_id: UUID

class Conversation(ConversationBase):
    id: UUID
    lead_id: UUID
    opened_at: datetime
    closed_at: Optional[datetime] = None
    model_config = {"from_attributes": True}

# --- FAQ Models ---
class FAQBase(BaseModel):
    question: str
    answer: str
    keywords: list[str] = []

class FAQCreate(FAQBase):
    pass

class FAQ(FAQBase):
    id: UUID
    hit_count: int = 0
    active: bool = True
    created_at: datetime
    model_config = {"from_attributes": True}

# --- Twilio Webhook payload ---
class TwilioWebhookPayload(BaseModel):
    From: str          # e.g. "whatsapp:+919876543210"
    To: str            # e.g. "whatsapp:+14155238886"
    Body: str          # Message text
    MessageSid: str
    NumMedia: str = "0"
    model_config = {"extra": "allow"}  # Twilio sends many extra fields

# --- API Response wrappers ---
class SuccessResponse(BaseModel):
    success: bool = True
    message: str = "ok"

class ErrorResponse(BaseModel):
    error: str
    code: str

class PaginatedResponse(BaseModel):
    data: list
    total: int
    page: int
    limit: int

# --- Lead with messages (for conversation view) ---
class LeadWithMessages(Lead):
    messages: list[Message] = []
