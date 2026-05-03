use std::{
    fs,
    path::{Path, PathBuf},
};

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng as AeadOsRng},
    AeadCore, Aes256Gcm, Nonce,
};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rsa::{
    pkcs8::{DecodePrivateKey, DecodePublicKey, EncodePrivateKey, EncodePublicKey, LineEnding},
    rand_core::{OsRng as RsaOsRng, RngCore},
    Oaep, RsaPrivateKey, RsaPublicKey,
};
use sha2::Sha256;
use thiserror::Error;
use zeroize::Zeroize;

const STORED_PREFIX: &str = "enc:v1:";
const ARGON2_SALT_LEN: usize = 16;
const AES_KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const RSA_BITS: usize = 4096;

#[derive(Debug, Error)]
pub enum KeyStoreError {
    #[error("E/S de llaves: {0}")]
    Io(#[from] std::io::Error),
    #[error("RSA: {0}")]
    Rsa(#[from] rsa::Error),
    #[error("PKCS#8: {0}")]
    Pkcs8(String),
    #[error("AES-GCM: {0}")]
    Aead(String),
    #[error("formato base64 inválido: {0}")]
    B64(#[from] base64::DecodeError),
    #[error("formato del keystore inválido: {0}")]
    Format(String),
    #[error("Argon2: {0}")]
    Argon2(String),
}

impl From<rsa::pkcs8::Error> for KeyStoreError {
    fn from(e: rsa::pkcs8::Error) -> Self {
        Self::Pkcs8(e.to_string())
    }
}

impl From<rsa::pkcs8::spki::Error> for KeyStoreError {
    fn from(e: rsa::pkcs8::spki::Error) -> Self {
        Self::Pkcs8(e.to_string())
    }
}

pub struct KeyStore {
    aes_key: [u8; AES_KEY_LEN],
}

impl Drop for KeyStore {
    fn drop(&mut self) {
        self.aes_key.zeroize();
    }
}

impl KeyStore {
    /// Carga las llaves desde `dir`, o las genera si no existen.
    /// `passphrase` se usa para envolver/desenvolver la llave privada RSA.
    pub fn initialize(dir: impl AsRef<Path>, passphrase: &str) -> Result<Self, KeyStoreError> {
        let dir = dir.as_ref();
        fs::create_dir_all(dir)?;

        let pub_path = dir.join("public.pem");
        let priv_path = dir.join("private.enc.pem");
        let aes_path = dir.join("aes.key.enc");

        let all_exist = pub_path.exists() && priv_path.exists() && aes_path.exists();
        let any_exist = pub_path.exists() || priv_path.exists() || aes_path.exists();

        if any_exist && !all_exist {
            return Err(KeyStoreError::Format(format!(
                "keystore corrupto: faltan archivos en {}",
                dir.display()
            )));
        }

        if !all_exist {
            tracing::warn!(
                target: "crypto",
                dir = %dir.display(),
                "Generando nuevo keystore (RSA-4096 + AES-256)..."
            );
            return Self::generate_and_persist(&pub_path, &priv_path, &aes_path, passphrase);
        }

        Self::load(&pub_path, &priv_path, &aes_path, passphrase)
    }

    fn generate_and_persist(
        pub_path: &PathBuf,
        priv_path: &PathBuf,
        aes_path: &PathBuf,
        passphrase: &str,
    ) -> Result<Self, KeyStoreError> {
        let mut rsa_rng = rsa::rand_core::OsRng;
        let private_key = RsaPrivateKey::new(&mut rsa_rng, RSA_BITS)?;
        let public_key = RsaPublicKey::from(&private_key);

        // 1) Public key: PEM en claro (SubjectPublicKeyInfo).
        let pub_pem = public_key.to_public_key_pem(LineEnding::LF)?;
        write_secret(pub_path, pub_pem.as_bytes(), 0o644)?;

        // 2) Private key: PKCS#8 PEM, envuelto con AES-256-GCM derivado de la passphrase.
        let priv_pem = private_key.to_pkcs8_pem(LineEnding::LF)?;
        let envelope = wrap_private_key(priv_pem.as_bytes(), passphrase)?;
        write_secret(priv_path, envelope.as_bytes(), 0o600)?;

        // 3) AES key: 32 bytes aleatorios, envueltos con RSA-OAEP-SHA256.
        let mut aes_key = [0u8; AES_KEY_LEN];
        RsaOsRng.fill_bytes(&mut aes_key);
        let wrapped = public_key.encrypt(&mut rsa_rng, Oaep::new::<Sha256>(), &aes_key)?;
        write_secret(aes_path, B64.encode(&wrapped).as_bytes(), 0o600)?;

        tracing::warn!(
            target: "crypto",
            "Keystore creado. Conserva KEYSTORE_PASSPHRASE: sin él los criptogramas son irrecuperables."
        );

        Ok(Self { aes_key })
    }

    fn load(
        pub_path: &PathBuf,
        priv_path: &PathBuf,
        aes_path: &PathBuf,
        passphrase: &str,
    ) -> Result<Self, KeyStoreError> {
        // Validamos el formato de la pública aunque no la usemos directamente
        // (la AES envuelta sólo se descifra con la privada).
        let pub_pem = fs::read_to_string(pub_path)?;
        RsaPublicKey::from_public_key_pem(&pub_pem)?;

        let envelope = fs::read_to_string(priv_path)?;
        let priv_pem = unwrap_private_key(&envelope, passphrase)?;
        let private_key = RsaPrivateKey::from_pkcs8_pem(&priv_pem)
            .map_err(|e| KeyStoreError::Pkcs8(e.to_string()))?;

        let wrapped_b64 = fs::read_to_string(aes_path)?;
        let wrapped = B64.decode(wrapped_b64.trim())?;
        let aes_vec = private_key.decrypt(Oaep::new::<Sha256>(), &wrapped)?;
        if aes_vec.len() != AES_KEY_LEN {
            return Err(KeyStoreError::Format(format!(
                "longitud inválida de la llave AES: {}",
                aes_vec.len()
            )));
        }
        let mut aes_key = [0u8; AES_KEY_LEN];
        aes_key.copy_from_slice(&aes_vec);

        Ok(Self { aes_key })
    }

    /// Cifra `plaintext` con AES-256-GCM y devuelve `enc:v1:<base64(nonce||ct||tag)>`.
    pub fn encrypt_secret(&self, plaintext: &[u8]) -> Result<String, KeyStoreError> {
        let cipher = aes_cipher(&self.aes_key)?;
        let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
        let ct = cipher
            .encrypt(&nonce, plaintext)
            .map_err(|e| KeyStoreError::Aead(e.to_string()))?;
        let mut blob = Vec::with_capacity(NONCE_LEN + ct.len());
        blob.extend_from_slice(nonce.as_ref());
        blob.extend_from_slice(&ct);
        Ok(format!("{}{}", STORED_PREFIX, B64.encode(&blob)))
    }

    /// Desencripta un blob `enc:v1:...`. Si no tiene el prefijo, lo trata como
    /// plaintext heredado (legado pre-cifrado) y lo devuelve tal cual.
    pub fn decrypt_secret(&self, stored: &str) -> Result<String, KeyStoreError> {
        if !stored.starts_with(STORED_PREFIX) {
            return Ok(stored.to_string());
        }
        let body = &stored[STORED_PREFIX.len()..];
        let blob = B64.decode(body)?;
        if blob.len() < NONCE_LEN + 16 {
            return Err(KeyStoreError::Format("blob AES-GCM truncado".into()));
        }
        let (nonce_bytes, ct) = blob.split_at(NONCE_LEN);
        let cipher = aes_cipher(&self.aes_key)?;
        let nonce = nonce_from_bytes(nonce_bytes)?;
        let plaintext = cipher
            .decrypt(&nonce, ct)
            .map_err(|e| KeyStoreError::Aead(e.to_string()))?;
        String::from_utf8(plaintext)
            .map_err(|e| KeyStoreError::Format(format!("UTF-8 inválido tras descifrar: {e}")))
    }

    pub fn is_encrypted(stored: &str) -> bool {
        stored.starts_with(STORED_PREFIX)
    }
}

// ============================================================
// Envoltura de la llave privada (passphrase -> Argon2id -> AES-GCM)
// Formato en disco (texto): "kdf:argon2id$v1$<b64 salt>$<b64 nonce||ct||tag>"
// ============================================================

const ENVELOPE_HEADER: &str = "kdf:argon2id$v1$";

fn derive_key_from_passphrase(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], KeyStoreError> {
    let mut out = [0u8; 32];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut out)
        .map_err(|e| KeyStoreError::Argon2(e.to_string()))?;
    Ok(out)
}

fn wrap_private_key(priv_pem: &[u8], passphrase: &str) -> Result<String, KeyStoreError> {
    let mut salt = [0u8; ARGON2_SALT_LEN];
    RsaOsRng.fill_bytes(&mut salt);
    let mut key = derive_key_from_passphrase(passphrase, &salt)?;

    let cipher = aes_cipher(&key)?;
    let nonce = Aes256Gcm::generate_nonce(&mut AeadOsRng);
    let ct = cipher
        .encrypt(&nonce, priv_pem)
        .map_err(|e| KeyStoreError::Aead(e.to_string()))?;
    key.zeroize();

    let mut blob = Vec::with_capacity(NONCE_LEN + ct.len());
    blob.extend_from_slice(nonce.as_ref());
    blob.extend_from_slice(&ct);

    Ok(format!(
        "{}{}${}\n",
        ENVELOPE_HEADER,
        B64.encode(salt),
        B64.encode(&blob)
    ))
}

fn unwrap_private_key(envelope: &str, passphrase: &str) -> Result<String, KeyStoreError> {
    let trimmed = envelope.trim();
    let body = trimmed
        .strip_prefix(ENVELOPE_HEADER)
        .ok_or_else(|| KeyStoreError::Format("encabezado de envoltura inválido".into()))?;
    let (salt_b64, blob_b64) = body
        .split_once('$')
        .ok_or_else(|| KeyStoreError::Format("envoltura malformada".into()))?;

    let salt = B64.decode(salt_b64)?;
    let blob = B64.decode(blob_b64)?;
    if blob.len() < NONCE_LEN + 16 {
        return Err(KeyStoreError::Format("blob de envoltura truncado".into()));
    }

    let mut key = derive_key_from_passphrase(passphrase, &salt)?;
    let cipher = aes_cipher(&key)?;
    let (nonce_bytes, ct) = blob.split_at(NONCE_LEN);
    let nonce = nonce_from_bytes(nonce_bytes)?;
    let plaintext = cipher
        .decrypt(&nonce, ct)
        .map_err(|e| KeyStoreError::Aead(format!("passphrase incorrecta o llave alterada: {e}")))?;
    key.zeroize();

    String::from_utf8(plaintext)
        .map_err(|e| KeyStoreError::Format(format!("PEM inválido tras descifrar: {e}")))
}

fn aes_cipher(key: &[u8; AES_KEY_LEN]) -> Result<Aes256Gcm, KeyStoreError> {
    Aes256Gcm::new_from_slice(key)
        .map_err(|e| KeyStoreError::Aead(format!("longitud inválida de la llave AES: {e}")))
}

fn nonce_from_bytes(bytes: &[u8]) -> Result<Nonce<<Aes256Gcm as AeadCore>::NonceSize>, KeyStoreError> {
    let arr: [u8; NONCE_LEN] = bytes
        .try_into()
        .map_err(|_| KeyStoreError::Format(format!("nonce de {NONCE_LEN} bytes esperado")))?;
    Ok(Nonce::<<Aes256Gcm as AeadCore>::NonceSize>::from(arr))
}

#[cfg(unix)]
fn write_secret(path: &PathBuf, contents: &[u8], mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(mode)
        .open(path)?;
    std::io::Write::write_all(&mut f, contents)?;
    Ok(())
}

#[cfg(not(unix))]
fn write_secret(path: &PathBuf, contents: &[u8], _mode: u32) -> std::io::Result<()> {
    fs::write(path, contents)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn round_trip_encrypt_decrypt() {
        let dir = tempdir().unwrap();
        let ks = KeyStore::initialize(dir.path(), "test-pass").unwrap();
        let blob = ks.encrypt_secret(b"hola mundo").unwrap();
        assert!(blob.starts_with(STORED_PREFIX));
        let plain = ks.decrypt_secret(&blob).unwrap();
        assert_eq!(plain, "hola mundo");
    }

    #[test]
    fn legacy_plaintext_passes_through() {
        let dir = tempdir().unwrap();
        let ks = KeyStore::initialize(dir.path(), "test-pass").unwrap();
        let plain = ks.decrypt_secret("$argon2id$v=19$m=...$abc").unwrap();
        assert_eq!(plain, "$argon2id$v=19$m=...$abc");
    }

    #[test]
    fn reload_with_correct_passphrase() {
        let dir = tempdir().unwrap();
        let ks1 = KeyStore::initialize(dir.path(), "p1").unwrap();
        let blob = ks1.encrypt_secret(b"secret").unwrap();
        drop(ks1);

        let ks2 = KeyStore::initialize(dir.path(), "p1").unwrap();
        assert_eq!(ks2.decrypt_secret(&blob).unwrap(), "secret");
    }

    #[test]
    fn reload_fails_with_wrong_passphrase() {
        let dir = tempdir().unwrap();
        let _ks = KeyStore::initialize(dir.path(), "right").unwrap();
        match KeyStore::initialize(dir.path(), "wrong") {
            Ok(_) => panic!("expected failure with wrong passphrase"),
            Err(KeyStoreError::Aead(_)) => {}
            Err(other) => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn tampered_ciphertext_fails() {
        let dir = tempdir().unwrap();
        let ks = KeyStore::initialize(dir.path(), "p").unwrap();
        let mut blob = ks.encrypt_secret(b"x").unwrap();
        // Flip a char in the base64 body.
        let last = blob.pop().unwrap();
        blob.push(if last == 'A' { 'B' } else { 'A' });
        assert!(ks.decrypt_secret(&blob).is_err());
    }
}
