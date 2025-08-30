from fastapi import FastAPI
from pydantic import BaseModel
from langchain_community.document_loaders import PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from dotenv import load_dotenv
import os
import requests
import numpy as np

load_dotenv()

app = FastAPI()

# Temporary global variables
vectorstore = None
qa_chain = None
openai_api_key = os.getenv("OPENAI_API_KEY")
SAMBANOVA_API_KEY = "48ca44db-ed78-46f0-a4c3-c264830fac29"
SAMBANOVA_CHAT_URL = "https://api.sambanova.ai/v1/chat/completions"
SAMBANOVA_MODEL = "Meta-Llama-3.1-8B-Instruct"  # You can change this to your preferred model

# Load local embedding model
embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

class PDFPath(BaseModel):
    filePath: str

class Question(BaseModel):
    question: str

@app.post("/process-pdf")
def process_pdf(data: PDFPath):
    global vectorstore, qa_chain

    loader = PyPDFLoader(data.filePath)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    chunks = splitter.split_documents(docs)
    if not chunks:
            print("Error: No chunks generated from document. Check if the PDF is empty or failed to load.")
            return {"error": "No text chunks generated from the PDF. Please check your file."}
    texts = [chunk.page_content for chunk in chunks]
    vectorstore = FAISS.from_documents(chunks, embedding_model)

    qa_chain = True  # Just a flag to indicate PDF is processed

    return {"message": "PDF processed successfully"}
@app.post("/ask")
def ask_question(data: Question):
    global vectorstore, qa_chain
    if not qa_chain:
        return {"answer": "Please upload a PDF first!"}

    # Use FAISS retriever instead of manual np.dot
    docs = vectorstore.similarity_search(data.question, k=1)
    if not docs:
        return {"answer": "No relevant context found."}

    context = docs[0].page_content

    # Prepare SambaNova chat request
    headers = {"Authorization": f"Bearer {SAMBANOVA_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": SAMBANOVA_MODEL,
        "messages": [
            {"role": "system", "content": "Answer the question using the provided context."},
            {"role": "user", "content": f"Context: {context}\nQuestion: {data.question}"}
        ]
    }
    response = requests.post(SAMBANOVA_CHAT_URL, json=payload, headers=headers)
    response.raise_for_status()
    answer = response.json()["choices"][0]["message"]["content"]
    return {"answer": answer}
