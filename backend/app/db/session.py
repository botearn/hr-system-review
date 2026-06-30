from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
    # Supabase transaction pooler (port 6543) multiplexes client connections
    # to a smaller backend pool, so the client-side pool size has no hard
    # ceiling. Keep enough headroom that a few daemon threads (vectorize,
    # capability derivation, pipeline) plus concurrent request handlers
    # never starve each other -- previously capped at 2+3=5 which made one
    # stuck daemon enough to hang every login.
    pool_size=5,
    max_overflow=15,
    # Surface pool exhaustion as a fast 5xx instead of a 30s hang -- if the
    # pool is genuinely full, queueing more requests just compounds the
    # problem.
    pool_timeout=10,
    pool_recycle=300,
    # Disable psycopg3 server-side prepared statements. PgBouncer in
    # transaction-pooling mode reuses backends across clients and silently
    # drops prepared statements between checkouts.
    connect_args={
        "prepare_threshold": None,
        # libpq connection timeouts -- psycopg passes these to the
        # underlying pq layer. Without them a network blip leaves the
        # worker stuck mid-handshake.
        "connect_timeout": 10,
    },
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
