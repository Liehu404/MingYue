from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migration: add decoration column if missing (for existing databases)
        await conn.run_sync(_migrate_add_decoration_column)
        await conn.run_sync(_migrate_add_role_definitions_column)


def _migrate_add_decoration_column(conn):
    """Add decoration JSON column to teams table if it doesn't exist."""
    import sqlalchemy as sa
    result = conn.execute(sa.text("PRAGMA table_info('teams')"))
    columns = [row[1] for row in result.fetchall()]
    if 'decoration' not in columns:
        conn.execute(sa.text("ALTER TABLE teams ADD COLUMN decoration JSON"))


def _migrate_add_role_definitions_column(conn):
    """Add role_definitions JSON column to teams table if it doesn't exist."""
    import sqlalchemy as sa
    result = conn.execute(sa.text("PRAGMA table_info('teams')"))
    columns = [row[1] for row in result.fetchall()]
    if 'role_definitions' not in columns:
        conn.execute(sa.text("ALTER TABLE teams ADD COLUMN role_definitions JSON"))
