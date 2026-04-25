from fastapi import APIRouter, Depends
from models.user import UserRegister, UserLogin, UserResponse, TokenResponse
from services.auth_service import register_user, login_user, get_user_by_id
from core.security import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user_data: UserRegister):
    """
    Register a new user.
    
    - **full_name**: User's full name (2-100 characters)
    - **username**: Unique username (alphanumeric + underscore, 3-30 chars)
    - **email**: Valid email address
    - **password**: Password (minimum 6 characters)
    - **role**: 'user' or 'admin' (default: 'user')
    """
    return await register_user(user_data)


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """
    Login with email and password.
    
    Returns a JWT access token to be used in the Authorization header:
    `Authorization: Bearer <token>`
    """
    return await login_user(credentials)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """
    Get the currently authenticated user's profile.
    Requires a valid JWT token.
    """
    return await get_user_by_id(current_user["user_id"])
