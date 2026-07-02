# Contributing — A Beginner's Guide

Welcome! 🎉 This guide will walk you through helping with the **Repair Cafe Silicon Valley Check-In app**, even if you have **never coded, never used Git, and never touched Claude Code** before.

You do **not** need to be a programmer. Our AI assistant, **Claude Code**, can do most of the hard parts for you — you just describe what you want in plain English. This guide shows you both ways for every step: the **easy way (ask Claude Code)** and the **manual way (type the commands yourself)**. Pick whichever you're comfortable with.

> Already a developer? The [README.md](./README.md) is the short technical reference. This file is the slow, friendly version.

Take your time. There is nothing here you can break that we can't undo. 🙂

---

## Table of Contents

1. [The big picture (read this first)](#1-the-big-picture-read-this-first)
2. [One-time setup](#2-one-time-setup)
3. [Making a change](#3-making-a-change)
4. [Checking your work (testing)](#4-checking-your-work-testing)
5. [Saving & sharing your work (Git)](#5-saving--sharing-your-work-git)
6. [Getting your change merged](#6-getting-your-change-merged)
7. [Cheat sheet & glossary](#7-cheat-sheet--glossary)
8. [Troubleshooting & getting help](#8-troubleshooting--getting-help)

---

## 1. The big picture (read this first)

Before any commands, here's the mental model. Just five ideas:

- **GitHub** — a website where the master copy of the code lives, like a shared Google Drive for code. Our project is here: <https://github.com/RepairCafeSiliconValley/CheckInSystem>
- **Your computer** — you'll download a personal copy of the code, make changes, and run the app on your own machine to see those changes.
- **A branch** — your own private "draft copy" of the code where you experiment. Your changes stay on your branch and don't affect anyone else until you're ready.
- **A Pull Request (PR)** — when your draft is ready, you "request" that your changes be added to the main project. A maintainer reviews it and clicks merge.
- **DEV vs PROD** — there are **two** live versions of the app:
  - **PROD** (production) = the real app, used at real events, with real visitor data.
  - **DEV** (development) = a safe playground with fake data, where you test.
  - **You only ever touch DEV.** Our setup makes it nearly impossible for your work to reach real data by accident. Relax. 😌

Here's the whole journey on one picture:

```
   GitHub (shared code)
        │
        │  1. clone (download a copy)
        ▼
   Your computer  ──►  2. make a branch (your draft)
        │                      │
        │                      │  3. edit + run the app locally to see it work
        │                      ▼
        │              4. commit (save a snapshot of your work)
        │                      │
        │  5. push (upload your branch back to GitHub)
        ▼                      │
   GitHub  ◄────────────────────┘
        │
        │  6. open a Pull Request  →  a maintainer reviews & merges it
        ▼
   Your change is now part of the project! 🎉
```

Don't worry about memorizing this. Refer back to it whenever you feel lost.

---

## 2. One-time setup

You only do this section **once**. It takes about 30–45 minutes. Go slowly and finish each step before the next.

### 2.1 Create a GitHub account & get access

1. Go to <https://github.com> and sign up for a free account (if you don't already have one).
2. Send your GitHub username to the project owner and ask to be **added to the `RepairCafeSiliconValley` organization**. You need this to upload your work later.

### 2.2 Install the tools you need

Install these four programs. Click the link, download, and run the installer with the default options.

| Tool | What it's for | Link |
|------|---------------|------|
| **Node.js** (choose the **LTS** version) | Runs the app on your computer | <https://nodejs.org> |
| **Git** | The tool that tracks changes & talks to GitHub | <https://git-scm.com/downloads> |
| **VS Code** | A free editor for viewing/editing code | <https://code.visualstudio.com> |
| **Claude Code** | The AI assistant that can do the work for you | <https://claude.com/claude-code> (follow its install instructions) |

**Check that Node and Git installed correctly.** Open a terminal:

- On **Mac**: open the **Terminal** app (press `Cmd + Space`, type "Terminal", hit Enter). Or just use the built-in terminal in VS Code: menu **Terminal → New Terminal**.

Type these two commands, one at a time, pressing Enter after each:

```bash
node -v
git -v
```

If each prints a version number (like `v20.11.0`), you're good. If you get "command not found," the install didn't finish — re-run the installer or ask for help.

> **Tip:** A "terminal" is just a window where you type commands instead of clicking buttons. Don't be intimidated — you'll only use a handful of commands, and Claude Code can run most of them for you.

### 2.3 Get the code onto your computer ("cloning")

"Cloning" = downloading your own copy of the project.

**Easy way — ask Claude Code:**
> "Clone the repo https://github.com/RepairCafeSiliconValley/CheckInSystem.git into my projects folder and open it."

**Manual way — type it yourself.** In the terminal, go to wherever you keep projects (e.g. your Desktop), then run:

```bash
git clone https://github.com/RepairCafeSiliconValley/CheckInSystem.git
cd CheckInSystem
```

`cd CheckInSystem` means "go into the project folder." From now on, run all commands from inside this folder.

### 2.4 Install the project's building blocks

The app depends on other code packages. Download them all with one command:

```bash
npm install
```

This takes a minute or two and creates a `node_modules` folder (you can ignore it). You only re-run this if someone adds a new package later.

### 2.5 Create your secret keys file (`.env.local`)

The app needs a username/password to talk to the **DEV** database. These live in a file called `.env.local`.

1. **Ask the project owner for the DEV Supabase URL and anon key.** (Supabase is the database service.)
2. Create a new file named exactly `.env.local` in the project's top folder, with this content:

```
VITE_SUPABASE_URL=<paste-the-dev-url-here>
VITE_SUPABASE_ANON_KEY=<paste-the-dev-anon-key-here>
```

> 🔒 **Two important rules:**
> - These **must** be the **DEV** keys, never PROD.
> - **Never share or upload this file.** It's already set to be ignored by Git (listed in `.gitignore`), so it won't get uploaded by accident — but don't paste its contents anywhere public.

**Easy way:** you can ask Claude Code: *"Create a `.env.local` file with these two values: ..."* and paste them in.

### 2.6 Run the app — the "it works!" moment 🎈

Start the app on your computer:

```bash
npm run dev
```

You'll see a message with a local web address, usually **<http://localhost:5173>**. Open that in your browser. If the Repair Cafe app appears, **your setup is complete.** Congratulations!

To stop the app later, click in the terminal and press `Ctrl + C`. To start it again, run `npm run dev` again.

---

## 3. Making a change

Let's walk through a real (tiny) example: **changing some wording on the visitor check-in screen.** The same steps work for any change.

### Step A — Start a fresh branch (your draft copy)

Always start new work from an up-to-date copy of the `dev` branch. **Never edit `main` directly.**

**Easy way — ask Claude Code:**
> "Switch to the `dev` branch, pull the latest changes, then make me a new branch called `feature/checkin-wording`."

**Manual way:**

```bash
git checkout dev
git pull
git checkout -b feature/checkin-wording
```

What this does: switches to `dev`, downloads the newest version, then creates and switches to your new branch named `feature/checkin-wording`. Name your branch after what you're doing (e.g. `feature/add-phone-help-text`).

### Step B — Make the edit (two ways — use whichever you like)

The app's screens live in the `src/` folder:
- `src/pages/` — the main screens (e.g. `CheckIn.jsx`, `Admin.jsx`, `FixerSubmit.jsx`).
- `src/components/` — smaller reusable pieces (buttons, inputs, etc.).

> Files ending in `.jsx` are **React** files. React is just a way of describing web pages using a mix of HTML-looking tags and JavaScript. You don't need to fully understand it — for text changes you can usually find the words you want to change and edit them directly.

#### Option 1 — With Claude Code (easiest)

Just describe what you want. Examples:

> "On the check-in page, change the heading from 'Check In' to 'Welcome — Check In Your Item'."

> "In `src/pages/CheckIn.jsx`, make the submit button say 'Add My Item' instead of 'Submit'."

Claude Code will find the right file and make the edit. **Always review what it changed** — it'll show you the before/after. If it's not what you wanted, just say so: *"Actually, undo that and instead..."*

#### Option 2 — By hand in VS Code

1. Open the project folder in VS Code (**File → Open Folder → CheckInSystem**).
2. In the left sidebar, open `src/pages/CheckIn.jsx`.
3. Use **Edit → Find** (`Cmd + F`) to search for the text you want to change.
4. Type your new text in place of the old text. Only change the words between the tags — don't delete the surrounding `<` `>` symbols.
5. **Save** the file (`Cmd + S`).

### Step C — See your change live

If `npm run dev` is still running, just switch to your browser — the page **updates automatically** the moment you save. (This is called "hot reload.") If you stopped it, run `npm run dev` again and open <http://localhost:5173>.

Click through to the screen you changed and confirm it looks right.

---

## 4. Checking your work (testing)

This project doesn't have automatic tests, so "testing" means **you** click through the app and make sure nothing broke. Do these three things before sharing your work:

1. **Click through the workflow you touched** in the browser:
   - Visitor check-in: open `http://localhost:5173/checkin?event=<some-event-id>` (ask for a DEV event id, or grab one from the Admin screen).
   - Staff dashboard: open `http://localhost:5173/staff` (you'll need the shared staff password).
   - Fixer screen: open `http://localhost:5173/fix/<work-order-id>`.
2. **Run the linter** — an automatic style/typo checker for code:
   ```bash
   npm run lint
   ```
   If it reports errors in a file you changed, fix them (or ask Claude Code: *"npm run lint is showing this error, can you fix it?"*). Don't worry about pre-existing warnings in files you didn't touch.
3. **Quick self-check:**
   - Does my change look right?
   - Did I accidentally break anything nearby?
   - Is the app still running without red errors? (Check the terminal and the browser's developer console.)

If all good, you're ready to save and share. ✅

---

## 5. Saving & sharing your work (Git)

So far your change only exists on your computer. Now we'll **save a snapshot (commit)**, **upload it (push)**, and **request it be added (pull request)**.

> **What's a commit?** A commit is a saved snapshot of your changes with a short note describing them, like "Update check-in heading wording." You can have several commits on one branch.

### Step 1 — Commit (save a snapshot)

**Easy way — ask Claude Code:**
> "Commit my changes with a message describing what I did."

**Manual way:**

```bash
git add .
git commit -m "Update check-in heading wording"
```

`git add .` stages all your changes; `git commit -m "..."` saves them with that message. Keep the message short and descriptive of *what* you changed.

### Step 2 — Push (upload your branch to GitHub)

**Easy way — ask Claude Code:**
> "Push my branch to GitHub."

**Manual way** (the first time on a new branch):

```bash
git push -u origin feature/checkin-wording
```

(Use your actual branch name. After the first push, just `git push` is enough.)

### Step 3 — Open a Pull Request (into `dev`)

A Pull Request (PR) is your formal request to add your work to the project.

**Easy way — ask Claude Code:**
> "Open a pull request from my branch into the `dev` branch."

**Manual way:**

1. Go to <https://github.com/RepairCafeSiliconValley/CheckInSystem>.
2. GitHub usually shows a yellow banner: **"Compare & pull request"** — click it. (If not, go to the **Pull requests** tab → **New pull request**.)
3. **Very important:** set the **base branch to `dev`** (not `main`). Your branch is the "compare" side.
4. Give it a clear title and a sentence or two describing what you changed and why.
5. Click **Create pull request.**

> ⚠️ **Always target `dev`, never `main`.** `main` is the live production site. New work goes into `dev` first.

---

## 6. Getting your change merged

After you open the PR, here's what happens — mostly automatic:

1. **A preview is built.** Vercel (our hosting service) automatically builds a temporary live "Preview" website of your branch (wired to the safe DEV database). A link appears in the PR so people can click around your change without installing anything.
2. **A maintainer reviews it.** They may approve it, or leave comments asking for tweaks. This is normal and friendly — it's how everyone's code gets better.
3. **If changes are requested**, just go back to your branch on your computer and make more edits, then commit and push again:
   ```bash
   git add .
   git commit -m "Address review feedback"
   git push
   ```
   The PR updates automatically — no need to open a new one.
4. **A maintainer merges it.** Once approved, a maintainer clicks **Merge**. Your change is now in `dev`. 🎉

> You do **not** merge to `main` yourself, and you don't need to merge to `dev` either — a maintainer handles that. Later, maintainers periodically promote everything in `dev` to `main` to go live. That part isn't your responsibility.

After your PR is merged, you can start your next change by going back to **[Step A](#step-a--start-a-fresh-branch-your-draft-copy)** (switch to `dev`, pull, make a new branch).

---

## 7. Cheat sheet & glossary

### Words you'll hear

| Term | Plain-English meaning |
|------|-----------------------|
| **Repo / repository** | The project's folder of code (lives on GitHub and on your computer). |
| **Clone** | Download your own copy of the repo. |
| **Branch** | Your private draft copy of the code to experiment in. |
| **Commit** | A saved snapshot of your changes, with a short message. |
| **Push** | Upload your commits to GitHub. |
| **Pull** | Download the latest changes from GitHub. |
| **Pull Request (PR)** | A request to add your branch's changes into the project; gets reviewed and merged. |
| **Merge** | Combining your changes into the main project. |
| **DEV** | The safe practice version of the app (fake data). You work here. |
| **PROD** | The real, live app (real data). You never touch it directly. |
| **Linter** | An automatic tool that checks code for style mistakes and typos. |

### Commands quick-reference

```bash
# --- one-time setup ---
git clone https://github.com/RepairCafeSiliconValley/CheckInSystem.git
cd CheckInSystem
npm install                 # download the project's packages
# (then create your .env.local file with DEV keys)

# --- run the app ---
npm run dev                 # start the app at http://localhost:5173 (Ctrl+C to stop)
npm run lint                # check your code for style errors

# --- start a new piece of work ---
git checkout dev
git pull
git checkout -b feature/my-change-name

# --- save and share your work ---
git add .
git commit -m "Short description of what I changed"
git push -u origin feature/my-change-name    # first push of a new branch
# then open a Pull Request on GitHub, with base = dev
```

> Remember: anything in this list, you can also just **ask Claude Code to do for you** in plain English.

---

## 8. Troubleshooting & getting help

| Problem | Likely fix |
|---------|-----------|
| App shows a blank page or a Supabase/connection error | Your `.env.local` is missing or has the wrong keys. Re-check [Step 2.5](#25-create-your-secret-keys-file-envlocal). |
| `command not found: node` (or `git`) | The tool didn't install. Re-run its installer, then close and reopen the terminal. |
| `npm install` fails with errors | Make sure you installed the **LTS** version of Node. Try again; if it still fails, copy the error to Claude Code or a maintainer. |
| "Merge conflict" message | Two changes touched the same lines. Don't panic — ask Claude Code: *"I have a merge conflict, can you help me resolve it?"* or ask a maintainer. |
| The app won't start / a red error in the terminal | Copy the full error message and paste it to Claude Code: *"I got this error when running the app, what do I do?"* |
| I think I broke something badly | That's fine — your work is on a branch, so the main project is safe. Ask for help; almost anything can be undone. |

**When in doubt, ask!** Two great helpers:
- **Claude Code** — paste any error or describe what's confusing you, in plain English.
- **A maintainer / the project owner** — reach out (ask the owner for the best way to contact the team).

Thanks for contributing to Repair Cafe Silicon Valley. Every fix helps keep more stuff out of the landfill. 💚
