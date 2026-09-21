from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_columns() -> None:
    """给已存在的表补上新增的列。

    create_all 只建新表、不改旧表，而这个项目已经有真实批改数据了，
    不能靠删库重建。SQLite 支持 ADD COLUMN，够用。
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                literal = _default_literal(column)

                if column.name not in existing:
                    col_type = column.type.compile(engine.dialect)
                    suffix = f" DEFAULT {literal}" if literal is not None else ""
                    conn.execute(
                        text(f'ALTER TABLE {table.name} ADD COLUMN "{column.name}" {col_type}{suffix}')
                    )

                # ADD COLUMN 不会回填已有行，而 SQLAlchemy 的 default= 只在插入时生效，
                # 所以非空列必须显式补一次，否则旧数据读出来是 NULL。
                if literal is not None and not column.nullable:
                    conn.execute(
                        text(
                            f'UPDATE {table.name} SET "{column.name}" = {literal} '
                            f'WHERE "{column.name}" IS NULL'
                        )
                    )


def _default_literal(column) -> str | None:
    """把列的标量默认值转成可直接嵌进 SQL 的字面量，没有则返回 None。"""
    default = column.default
    if default is None or not getattr(default, "is_scalar", False):
        return None

    value = default.arg
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    return None
