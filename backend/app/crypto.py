"""API Key 加密存储：教师粘贴的 Key 落库前用 Fernet 对称加密（技术方案第5节）。"""

import base64
import hashlib

from cryptography.fernet import Fernet


def _derive_key(secret: str) -> bytes:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


class Cryptor:
    def __init__(self, secret: str):
        self._fernet = Fernet(_derive_key(secret))

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")

    def decrypt(self, token: str) -> str:
        return self._fernet.decrypt(token.encode("utf-8")).decode("utf-8")
