"""初始化角色和管理员用户。

用法：
    cd backend
    python -m app.scripts.seed
"""

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.user import Role, User


def run() -> None:
    db = SessionLocal()
    try:
        admin_role = db.query(Role).filter_by(name="admin").first()
        if not admin_role:
            admin_role = Role(
                name="admin",
                description="系统管理员",
                permissions=["*"],
            )
            db.add(admin_role)

        consultant_role = db.query(Role).filter_by(name="consultant").first()
        if not consultant_role:
            consultant_role = Role(
                name="consultant",
                description="顾问",
                permissions=[
                    "candidate:read_own",
                    "candidate:write_own",
                    "company:read_own",
                    "company:write_own",
                    "position:read_own",
                    "position:write_own",
                ],
            )
            db.add(consultant_role)

        interviewer_role = db.query(Role).filter_by(name="interviewer").first()
        if not interviewer_role:
            interviewer_role = Role(
                name="interviewer",
                description="面试官（仅能访问候选人评估与代码作品打分）",
                permissions=[
                    "candidate:read",
                    "code_submission:read",
                    "code_submission:score",
                ],
            )
            db.add(interviewer_role)

        interviewee_role = db.query(Role).filter_by(name="interviewee").first()
        if not interviewee_role:
            interviewee_role = Role(
                name="interviewee",
                description="面试者（仅能访问面试平台：选题、提交作品、查看自己记录）",
                permissions=[
                    "interview:submit",
                    "interview:view_own",
                ],
            )
            db.add(interviewee_role)

        db.flush()

        admin = db.query(User).filter_by(username="admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@example.com",
                password_hash=hash_password("admin123"),
                display_name="Admin",
                role_id=admin_role.id,
                is_active=True,
            )
            db.add(admin)

        db.commit()
        print("Seed done. Login with admin / admin123")
    finally:
        db.close()


if __name__ == "__main__":
    run()
