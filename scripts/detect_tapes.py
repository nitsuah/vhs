import cv2
import numpy as np
import sys
import base64
import json
import io

def detect_tapes(image_bytes):
    # Convert bytes to numpy array
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    # Preprocessing: Grayscale -> Blur -> Canny Edge Detection
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)

    # Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    tapes = []
    for contour in contours:
        # Approximate the contour
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)

        # Assume tapes are rectangular (4 points) and have a minimum area
        if len(approx) == 4 and cv2.contourArea(contour) > 5000:
            # Crop the tape
            x, y, w, h = cv2.boundingRect(approx)
            roi = img[y:y+h, x:x+w]
            _, buffer = cv2.imencode('.jpg', roi)
            tapes.append(base64.b64encode(buffer).decode('utf-8'))

    return tapes

if __name__ == '__main__':
    # Read base64 image from stdin
    input_data = sys.stdin.read()
    if input_data.startswith('data:image/jpeg;base64,'):
        input_data = input_data.split(',')[1]

    image_bytes = base64.b64decode(input_data)
    results = detect_tapes(image_bytes)
    print(json.dumps(results))
