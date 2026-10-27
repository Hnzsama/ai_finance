import dotenv from "dotenv";

// Pastikan variabel dari .env menimpa environment variable shell bawaan (misal export OLLAMA_HOST dari ~/.bashrc)
dotenv.config({ override: true });
