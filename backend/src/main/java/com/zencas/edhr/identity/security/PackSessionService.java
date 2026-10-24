package com.zencas.edhr.identity.security;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
public class PackSessionService {
    private final JdbcTemplate jdbc;

    public void register(String token, Long userId, int validityMinutes) {
        jdbc.update("INSERT INTO pack_auth_session(token_hash,user_id,expires_at) VALUES (?,?,?)",
                hash(token), userId, Timestamp.from(Instant.now().plusSeconds(Math.max(1, validityMinutes) * 60L)));
    }

    public boolean isActive(String token, Long userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT COUNT(*) > 0 FROM pack_auth_session
                WHERE token_hash=? AND user_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP
                """, Boolean.class, hash(token), userId));
    }

    public void revoke(String token) {
        if (token != null) jdbc.update("UPDATE pack_auth_session SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?", hash(token));
    }

    public void revokeUser(Long userId) {
        jdbc.update("UPDATE pack_auth_session SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL", userId);
    }

    private String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
}
