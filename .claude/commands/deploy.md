Deploy the current development branch to production. Follow these steps exactly:

1. Check git status - make sure development branch is clean (no uncommitted changes)
2. Show me what commits will be deployed (git log main..development --oneline)
3. Ask for my confirmation before proceeding
4. After confirmation:
   - git checkout main
   - git merge development
   - git push origin main
   - git checkout development
5. Then SSH into production server and deploy:
   - SSH: `ssh -p 2022 dkmserver@78.186.120.189` (password: `dkmtne2024.`)
   - `cd ~/Desktop/Machinity/landing/tusbina && git pull origin main`
   - `cd ~/Desktop/Machinity/landing && docker compose -f tusbina-compose.yml --env-file tusbina/.env up -d --build`
   - Verify: `docker ps | grep tusbina` (should show 5 containers)
   - Health check: `curl https://tusbina.machinity.ai/health`
6. Report results
