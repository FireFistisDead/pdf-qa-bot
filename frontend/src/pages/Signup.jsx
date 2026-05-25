import React, { useState } from "react";
import axios from "axios";

import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
} from "@mui/material";

import { checkPasswordStrength } from "../utils/passwordStrength";

const Signup = () => {
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");

  const strength = checkPasswordStrength(password);

    const handleSignup = async () => {
    if (!email || !password) {
    setMessage("All fields are required");
    return;
    }

    if (strength === "Weak") {
        setMessage("Password too weak");
        return;
    }

    try {
        const res = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/auth/signup`,
        {
            email,
            password,
        }
        );

        setMessage(res.data.message);

        setTimeout(() => {
        window.location.href = "/login";
        }, 1000);

    } catch (error) {
        setMessage(
        error.response?.data?.message ||
            "Signup failed"
        );
    }
    };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#f5f5f5",
      }}
    >
      <Card
        sx={{
          width: 420,
          padding: 5,
          borderRadius: "24px",
          boxShadow:
            "0 10px 40px rgba(0,0,0,0.08)",
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontWeight: 700,
            mb: 4,
            textAlign: "center",
          }}
        >
          Signup
        </Typography>

        <TextField
          fullWidth
          label="Email"
          variant="outlined"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          sx={{ mb: 3 }}
        />

        <TextField
          fullWidth
          label="Password"
          type="password"
          variant="outlined"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />

        {strength && (
          <Typography
            sx={{
              mt: 2,
              color:
                strength === "Strong"
                  ? "green"
                  : strength === "Medium"
                  ? "orange"
                  : "red",
              fontWeight: 600,
            }}
          >
            Password Strength: {strength}
          </Typography>
        )}

        <Button
          fullWidth
          variant="contained"
          onClick={handleSignup}
          sx={{
            mt: 4,
            py: 1.5,
            borderRadius: "14px",
            background: "#7C4DFF",
            textTransform: "none",
            fontSize: "16px",
            fontWeight: 700,
          }}
        >
          Create Account
        </Button>

        {message && (
          <Typography
            sx={{
              mt: 3,
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            {message}
          </Typography>
        )}
      </Card>
    </Box>
  );
};

export default Signup;