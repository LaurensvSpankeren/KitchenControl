import hashlib
import hmac
import secrets

PBKDF2_ALGORITHM = "sha256"
PBKDF2_ITERATIONS = 600_000
PBKDF2_SALT_BYTES = 16


def hash_password(plain_password: str) -> str:
    password = str(plain_password or "")
    if not password:
        raise ValueError("Password is required")

    salt = secrets.token_bytes(PBKDF2_SALT_BYTES)
    derived_key = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_{PBKDF2_ALGORITHM}${PBKDF2_ITERATIONS}${salt.hex()}${derived_key.hex()}"


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        algorithm_label, iterations_raw, salt_hex, digest_hex = str(password_hash).split("$", 3)
    except ValueError:
        return False

    if algorithm_label != f"pbkdf2_{PBKDF2_ALGORITHM}":
        return False

    try:
        iterations = int(iterations_raw)
        salt = bytes.fromhex(salt_hex)
        expected_digest = bytes.fromhex(digest_hex)
    except (TypeError, ValueError):
        return False

    candidate_digest = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        str(plain_password or "").encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate_digest, expected_digest)
