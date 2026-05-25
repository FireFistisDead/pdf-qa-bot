import React, { useState } from 'react';
import './FAQ.css';

const faqs = [
  {
    question: "Do I need a GPU to run local models?",
    answer: "No, but it significantly accelerates inference. We support CPU execution via optimized C++ backends (like llama.cpp), so you can run smaller models cleanly on standard MacBooks or Windows machines."
  },
  {
    question: "Is my data sent to the cloud?",
    answer: "If you use the 'Local / Hobby' tier, 100% of your data stays on your machine. Your PDFs are vectorized locally into FAISS and never leave your environment. Pro users have optional end-to-end encrypted cloud sync."
  },
  {
    question: "Which models are supported?",
    answer: "DocuMind supports any GGUF/GGML models from Hugging Face natively. For cloud users, we also offer zero-config integrations with OpenAI GPT-4, Anthropic Claude 3, and Mistral Large."
  },
  {
    question: "Can I self-host the Enterprise version?",
    answer: "Yes. Enterprise plans include Dockerized deployments and Kubernetes helm charts so you can host the entire backend, vector database, and front-end within your own VPC or air-gapped environment."
  }
];

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState(0); // First one open by default

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? -1 : index);
  };

  return (
    <section className="faq-section section-wrap" id="faq">
      {/* Background Elements */}
      <div className="faq-bg-elements">
        <div className="faq-grid-bg"></div>
        <div className="faq-ambient-glow"></div>
        <div className="faq-ambient-glow-2"></div>
      </div>

      <div className="faq-content-wrapper">
        <div className="faq-header">
          <span className="tag-accent">Knowledge Base</span>
          <h2 className="display-lg">Frequently <span className="lime-text">Asked</span>.</h2>
          <p className="faq-subtitle text-hover-effect">
            Everything you need to know about running local models, deploying to the cloud, and managing vector databases securely.
          </p>
        </div>

        <div className="faq-container">
          {faqs.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              className={`faq-item ${isOpen ? 'active' : ''}`}
              onClick={() => toggleFAQ(index)}
            >
              <div className="faq-question">
                <h3>{faq.question}</h3>
                <div className="faq-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </div>
              </div>
              <div className="faq-answer-wrapper">
                <div className="faq-answer">
                  <div className="faq-answer-inner">
                    <p>{faq.answer}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
