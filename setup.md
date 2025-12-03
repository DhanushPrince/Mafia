# Setup Guide: Host React App on GitHub

Follow these steps to push your code to GitHub and host it.

## 1. Initialize and Push Code

Run these commands in your terminal (inside the project folder):

```bash
# 1. Initialize git (if not already done)
git init

# 2. Add all files to staging
git add .

# 3. Commit your changes
git commit -m "Initial commit"

# 4. Rename branch to main
git branch -M main

# 5. Add the remote repository
# If you get "error: remote origin already exists", use 'set-url' instead of 'add'
git remote add origin https://github.com/DhanushPrince/Mafia.git
# OR
git remote set-url origin https://github.com/DhanushPrince/Mafia.git

# 6. Push to GitHub
git push -u origin main
```

## 2. Troubleshooting: Permission Denied (403)

If you see an error like:  
`remote: Permission to DhanushPrince/Mafia.git denied to dhanush-aivar.`

This means your computer is remembering the wrong GitHub account (`dhanush-aivar`). You need to switch to `DhanushPrince`.

**Fix:**
1.  **Clear saved credentials:**
    ```bash
    git credential-osxkeychain erase
    host=github.com
    protocol=https
    # Press Enter, then Ctrl+D (or just Enter twice depending on prompt)
    ```
    *Note: If the command hangs, just press `Ctrl + C` and try the next step.*

2.  **Force authentication on next push:**
    When you run `git push`, it should ask for a username and password.
    *   **Username:** `DhanushPrince`
    *   **Password:** Your **Personal Access Token** (Not your login password).
        *   Go to GitHub -> Settings -> Developer Settings -> Personal access tokens -> Tokens (classic) -> Generate new token.
        *   Select `repo` scope.
        *   Copy the token and paste it when asked for the password.

## 3. Host Live App on GitHub Pages (Optional)

If you want to host the *running* website (not just the code), follow these extra steps:

1.  **Install gh-pages:**
    ```bash
    npm install gh-pages --save-dev
    ```

2.  **Update `package.json`:**
    Add these lines to your `package.json`:
    ```json
    "homepage": "https://DhanushPrince.github.io/Mafia",
    "scripts": {
      // ... other scripts
      "predeploy": "npm run build",
      "deploy": "gh-pages -d dist"
    }
    ```

3.  **Deploy:**
    ```bash
    npm run deploy
    ```

Your app will be live at: `https://DhanushPrince.github.io/Mafia`
