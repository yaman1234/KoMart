from pydantic import BaseModel
from typing import Generic, TypeVar

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    data: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class MessageResponse(BaseModel):
    message: str
