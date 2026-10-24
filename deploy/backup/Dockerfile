# Nightly encrypted database backups (#47): pg_dump → age → EU object storage via rclone.
# pg_dump must match the server's major version (PostGIS 17).
FROM postgres:17-alpine
RUN apk add --no-cache age rclone
COPY --chmod=755 deploy/backup/backup.sh /usr/local/bin/backup
USER postgres
ENTRYPOINT ["backup"]
CMD ["schedule"]
