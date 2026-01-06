"use client";

import { useState } from "react";
import { FaPaperPlane, FaSpinner } from "react-icons/fa";
import posthog from "posthog-js";

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to send");

      setStatus("success");
      setFormData({ name: "", email: "", message: "" });
      posthog.capture("contact_form_submitted");
      
      // Reset success message after 3 seconds
      setTimeout(() => setStatus("idle"), 3000);
    } catch (error) {
      console.error(error);
      setStatus("error");
      posthog.capture("contact_form_error");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          {/* <label htmlFor="name" className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
            Name
          </label> */}
          <input
            id="name"
            required
            className="bg-white/5 border border-white/10 rounded-sm p-2 text-sm text-gray-200 focus:border-accent-400/50 focus:outline-none transition-colors font-mono placeholder-gray-700"
            placeholder="Your Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            disabled={status === "loading"}
          />
        </div>
        <div className="flex flex-col gap-1">
          {/* <label htmlFor="email" className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
            Email
          </label> */}
          <input
            id="email"
            type="email"
            required
            className="bg-white/5 border border-white/10 rounded-sm p-2 text-sm text-gray-200 focus:border-accent-400/50 focus:outline-none transition-colors font-mono placeholder-gray-700"
            placeholder="Your Email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={status === "loading"}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {/* <label htmlFor="message" className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
          Message
        </label> */}
        <textarea
          id="message"
          required
          rows={4}
          className="bg-white/5 border border-white/10 rounded-sm p-2 text-sm text-gray-200 focus:border-accent-400/50 focus:outline-none transition-colors font-mono placeholder-gray-700 resize-none"
          placeholder="Your Message"
          value={formData.message}
          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
          disabled={status === "loading"}
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading" || status === "success"}
        className={`mt-2 flex items-center justify-center gap-2 py-2 px-4 rounded-sm text-xs uppercase tracking-widest font-bold transition-all duration-300 ${
          status === "success"
            ? "bg-green-500/10 text-green-400 border border-green-500/20 cursor-default"
            : status === "error"
            ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
            : "bg-accent-400/10 text-accent-400 border border-accent-400/20 hover:bg-accent-400/20"
        }`}
      >
        {status === "loading" ? (
          <>
            <FaSpinner className="animate-spin" /> Sending...
          </>
        ) : status === "success" ? (
          "Message Sent"
        ) : status === "error" ? (
          "Failed - Try Again"
        ) : (
          <>
            Send Message <FaPaperPlane className="text-[10px]" />
          </>
        )}
      </button>
    </form>
  );
}
