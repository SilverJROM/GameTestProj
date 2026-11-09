# Setup

Do this on the evaluation desktop after **Prepare workstation**. That action starts the seven-day submission window. Accepting the briefing link does not.

Read the monitoring notice in the portal before the first install. The first MCP check-in must name the project: A or B.

Secrets stay out of this folder. Card numbers, the signup email, billing address, inbox codes, and Git passwords live in the portal and in `docs/AI_Sub_guide.md` on your machine. Do not paste them here, into chat, or into the submission repository.

## Order

1. Confirm the portal shows a begin-by date, then choose **Prepare workstation** only when the seven submit days should start.
2. Sign in with Connection details. Open **Start Here** and read the starter repo, pinned revision, Git credential, and MCP steps.
3. Buy the two subscriptions below. Read tax and renewal on each official checkout before paying.
4. Install the CLIs and sign them in on that desktop.
5. Create the submission repository and the env file.
6. Copy `task/briefing_A.md` or `task/briefing_B.md` into the working repo and start with the North prompt in `task/workflow.md`.

## Subscriptions

The assessment card limit is **$55 total**, before you pay. Prices below are the vendors' monthly prices before tax, checked 2026-11-08. Confirm the live checkout. If tax pushes the pair over $55, take Grok Plus at $8 instead, or ask the evaluator before paying.

| Seat | Plan | Price | Job |
| --- | --- | --- | --- |
| Builder | Claude Pro, monthly | $20 | Claude Code. Includes the terminal agent. |
| Reviewer | Grok Premium, monthly | $30 | Requirements and plan review. Latest models, Grok Build. |
| Spare | Grok Plus, monthly | $8 | Use only if Premium plus tax exceeds $55. |

Leave these off. Each one is a separate charge or already over the cap:

- Claude Pro annual ($200 up front), Claude Max ($100), Claude Ultra ($200).
- Grok Super ($100), Grok Ultra ($200).
- Claude usage credits and the Grok API. Both bill outside the subscription pool.
- OpenRouter. It is a credit top-up with a 5.5% fee, and a second checkout needs the evaluator first.

Both chosen plans renew monthly. The work window is seven days. Cancel before renewal so the card is not charged again. Ask the evaluator before any renewal or extra charge.

Signup steps are in `docs/AI_Sub_guide.md`: evaluation-desktop browser, your name, the portal inbox for the code, the assessment card, the billing address printed there. Sign in to Claude and Grok on that same desktop.

## CLIs

On the Ubuntu desktop, after the subscriptions are active:

```bash
# Claude Code. Pro includes it. Use the install command from the official Claude docs.
claude --version
claude   # sign in with the Pro account

# Grok CLI, for the reviewer seat.
# Use the install command shown on the official Grok / xAI docs the day you set up.
grok --version

node --version    # 20 LTS or newer
npm --version
git --version
```

Cloudflare is a free account of your own. It is not part of the $55. Workers Free is enough for the demo: 100,000 requests a day and D1 on the free tier. The tight limit is 10 ms of CPU per request. Workers Paid is $5 a month and is a different charge. Ask the evaluator before the assessment card pays it.

```bash
npm install -g wrangler
wrangler --version
wrangler login
```

## Env

Create `.env` in the submission repo. Fill values locally. Do not commit the file.

```bash
# App
APP_ENV=preview
SESSION_SECRET=replace-with-a-long-random-string

# Synthetic evaluator login. Real values go in the private submission brief, not git.
DEMO_USER_EMAIL=clerk@example.test
DEMO_USER_PASSWORD=replace-me
DEMO_ADMIN_EMAIL=owner@example.test
DEMO_ADMIN_PASSWORD=replace-me
```

`.gitignore` for the submission repo:

```gitignore
.env
.env.*
node_modules/
.wrangler/
dist/
*.pem
docs/AI_Sub_guide.md
```

`docs/AI_Sub_guide.md` holds the signup email and billing address. Keep that file on your machine. Leave it out of the submission repo.

## Repo

Create an empty repository in your own GitHub account. A and B may be public or private. The evaluator must be able to read it. A personal access token is optional. If you use one, make it a fine-grained token with Contents read-only and Metadata read-only, and put it in the portal field, not in the repo.

Clone the common starter from Start Here first. Add your submission repo as a second remote named `submission`. Authenticate pushes with your own GitHub account. Keep the supplied Git credential out of URLs, shell history, and commits.

## Ready check

You are ready for `task/workflow.md` when all of these are true:

- `claude` and `grok` both answer a one-line prompt while signed in.
- `wrangler whoami` shows your Cloudflare account.
- The submission remote exists and a blank commit can push.
- `.env` exists and is gitignored.
- You have chosen A or B and told the agent in the first MCP check-in.
