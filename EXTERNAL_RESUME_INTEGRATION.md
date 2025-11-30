# External Resume Submission Integration Guide

This document provides instructions for integrating the external resume submission system with your Next.js landing page.

## Overview

Your Talent Pro application now supports receiving resume submissions from an external landing page. Candidates can submit their resumes directly through your landing page, and they will appear in the "Received Resumes" portal for admin review.

## API Endpoint

```
POST https://olkbhjyfpdvcovtuekzt.supabase.co/functions/v1/receive-external-resume
```

This is a **public endpoint** (no authentication required) that accepts resume submissions via `multipart/form-data`.

## Required Form Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `candidate_name` | string | ✅ Yes | Full name of the candidate |
| `candidate_email` | string | No | Candidate's email address |
| `candidate_phone` | string | No | Candidate's phone number |
| `interested_job` | string | ✅ Yes | Job position they're interested in |
| `admin_email` | string | ✅ Yes | Your receiving admin email (configured in Dev Options) |
| `resume` | File | ✅ Yes | Resume file (PDF or DOCX, max 10MB) |
| `honeypot` | string | No | Leave empty - for bot detection |

## Instructions for Firebase AI Studio Agent (Next.js Landing Page)

### 1. Create the Resume Submission Form Component

Create a new component at `components/ResumeSubmitForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react";

// IMPORTANT: Replace with your admin email configured in Talent Pro
const ADMIN_EMAIL = "Adilmunawarx@gmail.com";
const API_ENDPOINT = "https://olkbhjyfpdvcovtuekzt.supabase.co/functions/v1/receive-external-resume";

interface FormState {
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  interested_job: string;
  resume: File | null;
}

// Job positions available - customize as needed
const JOB_POSITIONS = [
  "Software Engineer",
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "DevOps Engineer",
  "Data Scientist",
  "Product Manager",
  "UI/UX Designer",
  "QA Engineer",
  "Other",
];

export function ResumeSubmitForm() {
  const [formData, setFormData] = useState<FormState>({
    candidate_name: "",
    candidate_email: "",
    candidate_phone: "",
    interested_job: "",
    resume: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [honeypot, setHoneypot] = useState(""); // Bot detection

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
      ];
      if (!allowedTypes.includes(file.type)) {
        setErrorMessage("Please upload a PDF or Word document.");
        return;
      }
      // Validate file size (10MB max)
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage("File size must be less than 10MB.");
        return;
      }
      setFormData({ ...formData, resume: file });
      setErrorMessage("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Bot detection - if honeypot is filled, silently "succeed"
    if (honeypot) {
      setSubmitStatus("success");
      return;
    }

    // Validation
    if (!formData.candidate_name.trim()) {
      setErrorMessage("Please enter your name.");
      return;
    }
    if (!formData.interested_job) {
      setErrorMessage("Please select a job position.");
      return;
    }
    if (!formData.resume) {
      setErrorMessage("Please upload your resume.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const submitData = new FormData();
      submitData.append("candidate_name", formData.candidate_name.trim());
      submitData.append("candidate_email", formData.candidate_email.trim());
      submitData.append("candidate_phone", formData.candidate_phone.trim());
      submitData.append("interested_job", formData.interested_job);
      submitData.append("admin_email", ADMIN_EMAIL);
      submitData.append("resume", formData.resume);
      submitData.append("honeypot", honeypot);

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        body: submitData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Submission failed");
      }

      setSubmitStatus("success");
      // Reset form
      setFormData({
        candidate_name: "",
        candidate_email: "",
        candidate_phone: "",
        interested_job: "",
        resume: null,
      });
    } catch (error: any) {
      console.error("Submission error:", error);
      setSubmitStatus("error");
      setErrorMessage(error.message || "Failed to submit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitStatus === "success") {
    return (
      <div className="text-center py-12 space-y-4">
        <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
        <h3 className="text-2xl font-bold">Thank You!</h3>
        <p className="text-muted-foreground">
          Your resume has been submitted successfully. We&apos;ll review it and get back to you soon.
        </p>
        <Button onClick={() => setSubmitStatus("idle")} variant="outline">
          Submit Another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Honeypot field - hidden from users, visible to bots */}
      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Website</Label>
        <Input
          id="website"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Full Name *</Label>
        <Input
          id="name"
          placeholder="John Doe"
          value={formData.candidate_name}
          onChange={(e) => setFormData({ ...formData, candidate_name: e.target.value })}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="john@example.com"
            value={formData.candidate_email}
            onChange={(e) => setFormData({ ...formData, candidate_email: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            value={formData.candidate_phone}
            onChange={(e) => setFormData({ ...formData, candidate_phone: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="job">Position Interested In *</Label>
        <Select
          value={formData.interested_job}
          onValueChange={(value) => setFormData({ ...formData, interested_job: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a position" />
          </SelectTrigger>
          <SelectContent>
            {JOB_POSITIONS.map((job) => (
              <SelectItem key={job} value={job}>
                {job}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="resume">Upload Resume * (PDF or DOCX, max 10MB)</Label>
        <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
          <input
            id="resume"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="resume" className="cursor-pointer">
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            {formData.resume ? (
              <p className="text-sm font-medium">{formData.resume.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Click to upload or drag and drop
              </p>
            )}
          </label>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 text-red-500 text-sm">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          "Submit Application"
        )}
      </Button>
    </form>
  );
}
```

### 2. Usage in Your Landing Page

Add the form to your careers or application page:

```tsx
import { ResumeSubmitForm } from "@/components/ResumeSubmitForm";

export default function CareersPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Join Our Team</h1>
        <p className="text-muted-foreground mb-8">
          Submit your resume and we&apos;ll get back to you within 48 hours.
        </p>
        
        <div className="bg-card p-8 rounded-xl shadow-lg">
          <ResumeSubmitForm />
        </div>
      </div>
    </div>
  );
}
```

### 3. Configuration Checklist

Before testing, ensure:

1. ✅ **Configure Admin Email in Talent Pro**: Go to Dev Options and set your receiving email address (e.g., `Adilmunawarx@gmail.com`)

2. ✅ **Update ADMIN_EMAIL constant**: In the `ResumeSubmitForm.tsx` component, update the `ADMIN_EMAIL` constant to match your configured email

3. ✅ **Test the Integration**: Submit a test resume and verify it appears in the "Received Resumes" portal in Talent Pro

### 4. Customization Options

#### Job Positions
Edit the `JOB_POSITIONS` array to match your company's open positions:

```tsx
const JOB_POSITIONS = [
  "Senior Software Engineer",
  "Junior Developer",
  "Project Manager",
  // Add your positions here
];
```

#### Styling
The component uses shadcn/ui components. Customize styles by modifying your Tailwind CSS configuration or adding custom classes.

#### Required Fields
By default, `candidate_name`, `interested_job`, and `resume` are required. Modify validation in `handleSubmit` to change this.

## Security Features

1. **Honeypot Field**: Invisible field that bots will fill out, allowing us to detect and reject automated submissions

2. **File Validation**: 
   - Only PDF and DOCX files accepted
   - Maximum 10MB file size

3. **Rate Limiting**: The edge function includes basic protection against spam

4. **Input Sanitization**: All inputs are trimmed and validated server-side

## Troubleshooting

### "Invalid admin email" error
- Ensure the `admin_email` in your form matches exactly what you configured in Talent Pro Dev Options
- The email is case-insensitive but must be a valid configured admin

### "This admin is not currently accepting submissions" error  
- The admin has disabled receiving submissions
- Go to Dev Options in Talent Pro and toggle "Accept Submissions" on

### File upload fails
- Ensure file is PDF or DOCX format
- Check file size is under 10MB
- Try a different file to rule out corruption

### CORS errors
- The endpoint allows all origins (`*`), so this shouldn't occur
- If using a proxy, ensure it passes through the correct headers

## Support

For issues with the integration, check:
1. Browser console for errors
2. Network tab for API response details
3. Talent Pro's "Received Resumes" portal for submitted entries
