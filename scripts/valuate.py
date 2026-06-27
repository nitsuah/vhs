import json
import webbrowser
import argparse

def valuate_tapes():
    try:
        with open('data/tapes.json', 'r', encoding='utf-8') as f:
            tapes = json.load(f)
    except FileNotFoundError:
        print("Error: data/tapes.json not found.")
        return
    except json.JSONDecodeError:
        print("Error: Could not decode data/tapes.json. Is it empty or malformed?")
        return

    unvalued_tapes = [t for t in tapes if not t.get('value_low') and not t.get('value_high')]

    if not unvalued_tapes:
        print("All tapes already have valuation data.")
        return

    print(f"Found {len(unvalued_tapes)} unvalued tapes. Opening eBay search for each...")

    for tape in unvalued_tapes:
        query = f"{tape.get('title', '')} VHS"
        ebay_url = f"https://www.ebay.com/sch/i.html?_nkw={query}&LH_Sold=1&LH_Complete=1"
        print(f"Opening eBay for: {tape.get('title')} (ID: {tape.get('id')})")
        webbrowser.open_new_tab(ebay_url)
        
        # User will manually update values and re-run.
        # This script doesn't modify tapes.json directly in semi-automated mode.

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Semi-automated VHS tape valuation via eBay search.')
    args = parser.parse_args()
    valuate_tapes()
