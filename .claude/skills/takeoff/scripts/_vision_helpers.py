"""
Vision-based property analysis helpers using Claude's vision API.
"""

import base64
import json
import os


def estimate_stories_from_image(street_view_path: str, anthropic_api_key: str) -> int:
    """
    Estimate the number of stories from a street view image using Claude Vision.

    Returns the estimated story count (1, 2, 3, etc.) or 0 if estimation fails.
    """
    if not anthropic_api_key or not street_view_path:
        return 0

    if not os.path.exists(street_view_path):
        return 0

    try:
        import anthropic

        with open(street_view_path, "rb") as f:
            raw_bytes = f.read()
        image_data = base64.standard_b64encode(raw_bytes).decode("utf-8")

        # Detect media type
        if raw_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            media_type = "image/png"
        elif raw_bytes[:2] == b'\xff\xd8':
            media_type = "image/jpeg"
        else:
            media_type = "image/jpeg"

        client = anthropic.Anthropic(api_key=anthropic_api_key)

        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=100,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "How many stories/floors does the main residential house in this image have? "
                            "Count above-grade living levels only (not attic or basement). "
                            "A split-level counts as 2 stories. "
                            "Respond with ONLY a JSON object: {\"stories\": <number>}"
                        ),
                    },
                ],
            }],
        )

        response_text = message.content[0].text.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()

        result = json.loads(response_text)
        stories = int(result.get("stories", 0))
        print(f"    → Vision story estimate: {stories}")
        return stories

    except Exception as e:
        print(f"    ✗ Vision story estimation error: {e}")
        return 0
