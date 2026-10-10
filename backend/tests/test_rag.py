import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Document, DocumentChunk, User
from app.services.rag import retrieve_chunks


class RagRetrievalTests(unittest.TestCase):
    def test_sqlite_retrieval_ranks_chunks_and_returns_documents(self) -> None:
        engine = create_engine("sqlite://")
        Base.metadata.create_all(bind=engine)
        with Session(engine) as session:
            user = User(email="admin@example.com", full_name="Admin", password_hash="hash", access_role="admin")
            session.add(user)
            session.flush()
            relevant_document = Document(filename="relevant.txt", status="ready", uploaded_by=user.id)
            other_document = Document(filename="other.txt", status="ready", uploaded_by=user.id)
            session.add_all([relevant_document, other_document])
            session.flush()
            session.add_all(
                [
                    DocumentChunk(
                        document_id=relevant_document.id,
                        chunk_index=0,
                        content="matching evidence",
                        embedding=[1.0, 0.0],
                        source_section="Section 1",
                    ),
                    DocumentChunk(
                        document_id=other_document.id,
                        chunk_index=0,
                        content="unrelated evidence",
                        embedding=[0.0, 1.0],
                        source_section="Section 2",
                    ),
                ]
            )
            session.commit()

            ranked = retrieve_chunks(session, [1.0, 0.0], top_k=1)

        self.assertEqual(len(ranked), 1)
        self.assertEqual(ranked[0][0], 1.0)
        self.assertEqual(ranked[0][1].content, "matching evidence")
        self.assertEqual(ranked[0][2].filename, "relevant.txt")
        Base.metadata.drop_all(bind=engine)
        engine.dispose()

    def test_postgres_retrieval_expression_uses_cosine_operator(self) -> None:
        statement = select(DocumentChunk.embedding.cosine_distance([0.0] * 768))

        self.assertIn("<=>", str(statement.compile(dialect=postgresql.dialect())))


if __name__ == "__main__":
    unittest.main()