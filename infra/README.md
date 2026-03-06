# Infra

Bu klasör local geliştirme ve MVP dağıtımı için altyapı başlangıç dosyalarını içerir.

- `nginx/default.conf`: API reverse proxy + Expo web static build root serving
- `../docker-compose.yml`: Postgres + Redis + API + Worker + Nginx (+ `apps/mobile/dist` mount)
