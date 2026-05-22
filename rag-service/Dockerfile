FROM python:3.10-slim

WORKDIR /app

# Install system dependencies required for some Python packages (e.g. FAISS/Torch)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

# Install CPU-only PyTorch first
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
