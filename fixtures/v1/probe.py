from pathlib import Path

print("PY_G0_V1", Path(__file__).with_name("reference.txt").read_text().strip())
