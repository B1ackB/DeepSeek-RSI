from pathlib import Path

print("PY_G0_V2", Path(__file__).with_name("reference.txt").read_text().strip())
