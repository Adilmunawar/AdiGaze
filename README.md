# ✨ TalentHunter by AdilMunawar

An intelligent, open-source resume parser and candidate matching system powered by Google Gemini and Supabase.

---

TalentHunter revolutionizes the recruitment process by automating the most time-consuming tasks. It leverages the state-of-the-art Google Gemini API to instantly parse resumes, extract structured data, and intelligently match candidates to your job descriptions. Built on a fully serverless stack with Supabase, it's scalable, fast, and easy to deploy.

## 🚀 Key Features

* **🤖 AI-Powered Resume Parsing:** Upload resumes (PDF, DOCX, etc.) and let the Gemini API extract key information like contact details, work experience, skills, and education into a structured JSON format.
* **🔍 Smart Candidate Matching:** Input a job description, and TalentHunter will scan your entire candidate database to find and rank the best-matched profiles.
* **⚡ Serverless Backend:** Powered entirely by Supabase, using Postgres for the database, Storage for resume files, and Edge Functions for all backend logic.
* **💾 Secure File & Data Storage:** All candidate data and resume files are securely stored and managed within your own Supabase project.
* **🌐 Modern Frontend:** A clean, responsive UI built with React (Vite), TypeScript, and Tailwind CSS (using shadcn/ui).
* **🔓 100% Open Source:** Fully customizable, extensible, and community-driven.

---

## 🛠️ Tech Stack & Architecture

TalentHunter uses a modern, serverless architecture that is both powerful and cost-effective.

* **Frontend:** React (Vite), TypeScript, Tailwind CSS, shadcn/ui
* **Backend:** Supabase
* **Database:** Supabase Postgres
* **Auth:** Supabase Auth
* **Storage:** Supabase Storage (for resume files)
* **Functions:** Supabase Edge Functions (Deno)
* **AI:** Google Gemini API

### System Flow

1.  **Resume Upload:** The user uploads a resume file from the React frontend.
2.  **File Storage:** The file is securely uploaded directly to Supabase Storage.
3.  **Parsing Function:** A client-side call invokes the `parse-resume` Supabase Edge Function, passing the file path.
4.  **AI Processing:** The Edge Function retrieves the file, converts it to text, and sends it to the Google Gemini API with a prompt to extract structured data.
5.  **Database Insert:** Gemini returns a structured JSON object, which the Edge Function then saves as a new entry in the `candidates` table in the Supabase Database.
6.  **Candidate Matching:**
    * A user submits a job description on the "Candidate Hunting" page.
    * This invokes the `match-candidates` Edge Function.
    * The function retrieves all candidates from the database and uses a specialized Gemini prompt to compare them against the job description, returning a ranked list of the best matches.

---

## 🏁 Getting Started

You can get a local instance of TalentHunter up and running in minutes.

### Prerequisites

* Node.js (or Bun)
* Supabase Account (free tier is sufficient)
* Google Gemini API Key
* Supabase CLI

### 1. Clone the Repository

```bash
git clone [https://github.com/AdilMunawar/talenthunter.git](https://github.com/AdilMunawar/talenthunter.git)
cd talenthunter
````

### 2\. Install Dependencies

Install the frontend dependencies:

```bash
# Using npm
npm install

# Using bun
bun install
```

### 3\. Set up Supabase

Log in to the Supabase CLI:

```bash
supabase login
```

Link your local project to your Supabase project (find your `[project-id]` in your Supabase dashboard URL):

```bash
supabase link --project-ref [project-id]
```

Push the database migrations to set up your tables:

```bash
supabase db push
```

### 4\. Configure Environment Variables

**Frontend (`.env.local`):**

Create a file named `.env.local` in the root of the project and add your Supabase project URL and anon key (found in Project Settings \> API in your dashboard):

```.env
VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

**Backend (Supabase Edge Functions):**

You must set your Gemini API key as a secret for your Supabase project.

```bash
supabase secrets set GEMINI_API_KEY=YOUR_GOOGLE_GEMINI_API_KEY
```

### 5\. Deploy Edge Functions

Deploy the `parse-resume` and `match-candidates` functions to your Supabase project:

```bash
# Deploy all functions
supabase functions deploy --no-verify-jwt
```

(Note: `--no-verify-jwt` is used for simplicity. For production, you should enforce JWT verification.)

### 6\. Run the Application

You're all set\! Start the development server:

```bash
# Using npm
npm run dev

# Using bun
bun run dev
```

Open `http://localhost:5173` to see your app in action.

-----

## 🤝 How to Contribute

We welcome contributions of all sizes, from bug reports to new features\! This project is for the community, and we're excited to see what you'll build with it.

### Ways to Contribute

  * **Report Bugs:** Find a bug? Open an issue and describe it clearly.
  * **Suggest Features:** Have an idea for a new feature? Open an issue to discuss it.
  * **Submit Pull Requests:** Ready to contribute code? Follow these steps:

### Pull Request Process

1.  Fork the repository.
2.  Create a new feature branch (`git checkout -b feature/YourAmazingFeature`).
3.  Make your changes and commit them (`git commit -m 'Add some YourAmazingFeature'`).
4.  Push to your branch (`git push origin feature/YourAmazingFeature`).
5.  Open a Pull Request against the `main` branch of this repository.

Please make sure your code is formatted and linted.

```bash
# Run the linter
npm run lint
```

We'll review your PR as soon as possible. Thank you for helping make TalentHunter better\!

-----

## 📄 License

This project is open-source and distributed under the **MIT License**. See the `LICENSE` file for more information.

<br>

<p align="center"\>
Built with ❤️ by Adil Munawar and the open-source community.
</p>
