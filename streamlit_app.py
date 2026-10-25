
import streamlit as st
import json
import os
from datetime import datetime, timezone

st.set_page_config(
    page_title="BNB Treasury Helper",
    page_icon="🛡️",
)

AGENT_NAME = "BNB Treasury Helper"

def get_agent_card():
    return {
        "name": AGENT_NAME,
        "description": (
            "A health-factor monitoring assistant "
            "for lending-position risk awareness."
        ),
        "category": "health-factor-monitoring",
        "version": "1.0.0",
        "capabilities": ["health-factor-monitoring"],
        "endpoints": {
            "app": os.getenv("PUBLIC_APP_URL", "")
        },
        "chainId": int(os.getenv("CHAIN_ID", "97")),
        "agentRegistry": os.getenv("ERC8004_REGISTRY_ADDRESS") or None,
        "agentId": os.getenv("ERC8004_AGENT_ID") or None,
        "owner": os.getenv("OWNER_ADDRESS") or None,
    }

st.title("🛡️ BNB Treasury Helper")
st.write(
    "A starter dashboard for lending health-factor "
    "monitoring. No wallet connection or transactions."
)

st.info(
    "Live lending data is not configured. "
    "No real health factor is being reported."
)

st.subheader("Agent card")
st.json(get_agent_card())

st.caption(
    "Last page render: "
    + datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
)
