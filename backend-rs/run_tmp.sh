#!/bin/bash
cd /home/zihowl/Documentos/8vo/Proyecto_IDS_II/EduSync_CAT/backend-rs

# Let's fix tracing subscriber to show info by default
sed -i 's/EnvFilter::from_default_env()/tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into())/' src/main.rs

# Let's make genesis protocol print even if the user exists
sed -i '/if count > 0 {/,/}/c\    if count > 0 {\n        tracing::info!("Genesis Protocol: El usuario semilla ya existe (email: {}).", config.genesis_super_admin_email);\n        return Ok(());\n    }' src/main.rs
