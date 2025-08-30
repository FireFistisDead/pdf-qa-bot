
import React, { useState } from "react";
import axios from "axios";
import { Container, Typography, Box, Button, TextField, Paper, Avatar, CircularProgress, AppBar, Toolbar, IconButton } from "@mui/material";
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SendIcon from '@mui/icons-material/Send';

function App() {
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);

  const uploadPDF = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      await axios.post("http://localhost:4000/upload", formData);
      alert("PDF uploaded!");
    } catch (e) {
      alert("Upload failed.");
    }
    setUploading(false);
  };

  const askQuestion = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setChat([...chat, { role: "user", text: question }]);
    try {
      const res = await axios.post("http://localhost:4000/ask", { question });
      setChat(prev => [...prev, { role: "bot", text: res.data.answer }]);
    } catch (e) {
      setChat(prev => [...prev, { role: "bot", text: "Error getting answer." }]);
    }
    setQuestion("");
    setAsking(false);
  };

  return (
    <Container maxWidth="sm">
      <AppBar position="static" color="primary" sx={{ mb: 2 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>PDF Q&A Bot</Typography>
          <Avatar sx={{ bgcolor: "white", color: "primary.main" }}>📄</Avatar>
        </Toolbar>
      </AppBar>

      <Paper elevation={3} sx={{ p: 3, mb: 2 }}>
        <Box display="flex" alignItems="center" gap={2}>
          <Button
            variant="contained"
            component="label"
            startIcon={<UploadFileIcon />}
            disabled={uploading}
          >
            Upload PDF
            <input type="file" hidden onChange={(e) => setFile(e.target.files[0])} />
          </Button>
          <Button variant="outlined" onClick={uploadPDF} disabled={!file || uploading}>
            {uploading ? <CircularProgress size={24} /> : "Submit"}
          </Button>
          {file && <Typography variant="body2">{file.name}</Typography>}
        </Box>
      </Paper>

      <Paper elevation={3} sx={{ p: 3, mb: 2, minHeight: 300 }}>
        <Typography variant="subtitle1" gutterBottom>Chat</Typography>
        <Box sx={{ maxHeight: 250, overflowY: "auto", mb: 2 }}>
          {chat.map((msg, i) => (
            <Box key={i} display="flex" justifyContent={msg.role === "user" ? "flex-end" : "flex-start"} mb={1}>
              <Box
                sx={{
                  bgcolor: msg.role === "user" ? "primary.light" : "grey.200",
                  color: "text.primary",
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  maxWidth: "80%"
                }}
              >
                <Typography variant="body2"><b>{msg.role === "user" ? "You" : "Bot"}:</b> {msg.text}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
        <Box display="flex" gap={1}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Ask a question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={asking}
            onKeyDown={e => { if (e.key === "Enter") askQuestion(); }}
          />
          <IconButton color="primary" onClick={askQuestion} disabled={asking || !question.trim()}>
            {asking ? <CircularProgress size={24} /> : <SendIcon />}
          </IconButton>
        </Box>
      </Paper>
    </Container>
  );
}

export default App;
