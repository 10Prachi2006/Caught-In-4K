"""
SQLite connection. No install, no server, no download -- it's just a file
(ivmap.db) that gets created in the backend/ folder the first time you run
the app. Good enough for a hackathon demo on a single machine.
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

# Falls back to a local SQLite file if DATABASE_URL isn't set in .env
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ivmap.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    # SQLite needs this because FastAPI can hit the same connection from
    # different threads; safe for our single-process demo use.
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()