import cv2
import numpy as np
import base64
import json
import sys

def crop_image(image_bytes, bbox):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    x, y, w, h = bbox['x'], bbox['y'], bbox['w'], bbox['h']
    
    # Ensure bounding box is within image dimensions
    x = max(0, x)
    y = max(0, y)
    w = min(w, img.shape[1] - x)
    h = min(h, img.shape[0] - y)

    cropped_img = img[int(y):int(y+h), int(x):int(x+w)]
    
    _, buffer = cv2.imencode('.jpg', cropped_img, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    return base64.b64encode(buffer).decode('utf-8')

if __name__ == '__main__':
    input_data = sys.stdin.read()
    data = json.loads(input_data)
    
    image_base64 = data['image']
    bbox = data['bbox']
    
    if image_base64.startswith('data:image/jpeg;base64,'):
        image_base64 = image_base64.split(',')[1]

    image_bytes = base64.b64decode(image_base64)
    
    cropped_base64 = crop_image(image_bytes, bbox)
    
    print(json.dumps({'cropped_image': cropped_base64}))
