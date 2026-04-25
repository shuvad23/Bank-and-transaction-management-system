from motor.motor_asyncio import AsyncIOMotorClient
from core.config import settings

# Global database client - initialized on app startup
client: AsyncIOMotorClient = None
database = None

# In-memory database for demo purposes
in_memory_db = {
    "users": [],
    "accounts": [],
    "transactions": []
}


async def connect_to_mongo():
    """Create MongoDB connection on application startup."""
    global client, database
    try:
        print(f"Connecting to MongoDB...")
        
        client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=2000,
            retryWrites=True,
            w="majority"
        )
        database = client[settings.DATABASE_NAME]

        # Create indexes for performance and uniqueness
        await database.users.create_index("email", unique=True)
        await database.users.create_index("username", unique=True)
        await database.accounts.create_index("account_number", unique=True)
        await database.accounts.create_index("user_id")
        await database.transactions.create_index("from_account")
        await database.transactions.create_index("to_account")
        await database.transactions.create_index("created_at")

        print("Connected to MongoDB successfully!")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        print("Using in-memory database for demo purposes...")
        global in_memory_db
        database = in_memory_db


async def close_mongo_connection():
    """Close MongoDB connection on application shutdown."""
    global client
    if client:
        client.close()
        print("MongoDB connection closed.")


def get_database():
    """Return the active database instance."""
    return database
