import os
import httpx
import time

BASE_URL = "http://localhost:8000"

def run_tests():
    print("Starting Manual Verification Script...")

    # Ensure a sample PDF exists for uploading
    sample_pdf_path = "sample_test_doc.pdf"
    if not os.path.exists(sample_pdf_path):
        with open(sample_pdf_path, "wb") as f:
            # We just create a dummy file for the upload endpoint.
            # It might fail PyMuPDF extraction but it will pass upload.
            # Wait, the RAG endpoint requires text. Let's make a dummy txt file.
            pass
        
    sample_txt_path = "sample_test_doc.txt"
    with open(sample_txt_path, "w") as f:
        f.write("This is a sample document for testing the SmartDocs AI RAG pipeline. It contains highly confidential information about Project Alpha.")

    with httpx.Client(base_url=BASE_URL) as client:
        print("\n--- 1. Auth Tests ---")
        user1_email = f"user1_{int(time.time())}@example.com"
        
        # Register User 1
        res = client.post("/auth/register", json={
            "email": user1_email,
            "password": "password123",
            "full_name": "Test User 1"
        })
        print("Register User 1:", res.status_code, res.text)

        # Login User 1
        res = client.post("/auth/login", data={
            "username": user1_email,
            "password": "password123"
        })
        print("Login User 1:", res.status_code)
        token1 = res.json().get("access_token")
        headers1 = {"Authorization": f"Bearer {token1}"}

        # Get Profile User 1
        res = client.get("/auth/me", headers=headers1)
        print("Profile User 1:", res.status_code, res.json())

        print("\n--- 2. Document Tests ---")
        # Upload Document
        with open(sample_txt_path, "rb") as f:
            files = {"file": (sample_txt_path, f, "text/plain")}
            res = client.post("/documents/upload", headers=headers1, files=files)
        print("Upload Document:", res.status_code, res.json())
        doc_id = res.json().get("document_id")

        print("Waiting for indexing to complete...")
        for _ in range(15):
            res = client.get(f"/documents/{doc_id}/status", headers=headers1)
            status = res.json().get("status")
            if status == "indexed":
                print("Document successfully indexed!")
                break
            time.sleep(1)
        
        # List Documents
        res = client.get("/documents/", headers=headers1)
        print("List Documents:", res.status_code, res.json())

        print("\n--- 3. RAG Tests ---")
        # Ask question with document_id
        res = client.post("/chat/ask", headers=headers1, json={
            "question": "What is the confidential project name?",
            "document_id": doc_id
        })
        print("Ask Question (Doc ID):", res.status_code)
        try:
            print("Answer:", res.json().get("answer"))
        except:
            print(res.text)

        print("\n--- 4. Security Test (Multi-Tenant Isolation) ---")
        user2_email = f"user2_{int(time.time())}@example.com"
        # Register User 2
        client.post("/auth/register", json={
            "email": user2_email,
            "password": "password123",
            "full_name": "Test User 2"
        })
        # Login User 2
        res = client.post("/auth/login", data={
            "username": user2_email,
            "password": "password123"
        })
        token2 = res.json().get("access_token")
        headers2 = {"Authorization": f"Bearer {token2}"}

        # User 2 tries to ask question on User 1's document
        res = client.post("/chat/ask", headers=headers2, json={
            "question": "What is the confidential project name?",
            "document_id": doc_id
        })
        print("User 2 accesses User 1's Document:", res.status_code, res.text)
        assert res.status_code == 404, "Security isolation failed! User 2 should get 404."
        print("Security Isolation verified successfully!")

    # Cleanup
    if os.path.exists(sample_pdf_path): os.remove(sample_pdf_path)
    if os.path.exists(sample_txt_path): os.remove(sample_txt_path)

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"Error connecting to server. Ensure FastAPI is running on {BASE_URL}")
        print(e)
