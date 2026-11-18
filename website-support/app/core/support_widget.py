"""CSP extension restricted to first-party user HTML documents."""
import re
HOSTS = {"notepreso.com", "www.notepreso.com", "presentation.notepreso.com", "translation.notepreso.com"}
def eligible(host, path, content_type):
    return host in HOSTS and "text/html" in content_type and not re.match(r"^/(auth|login|admin|api|docs|redoc|realms)(/|$)", path)
def extend_csp(value):
    parts = [p.strip().split() for p in value.split(";") if p.strip()]
    for directive, source in [("script-src", "https://live.cekat.ai"), ("frame-src", "https://live.cekat.ai"), ("style-src-attr", "'unsafe-inline'")]:
        entry = next((p for p in parts if p[0] == directive), None)
        if entry is None:
            fallback = next((p[1:] for p in parts if p[0] == "default-src"), ["'self'"])
            entry = [directive] + (fallback if directive != "style-src-attr" else [])
            parts.append(entry)
        if source not in entry:
            if "'none'" in entry: entry.remove("'none'")
            entry.append(source)
    return "; ".join(" ".join(p) for p in parts)
