#!/usr/bin/env bash
# Render build script - runs on every deploy.
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

# Face search ("find my photos" selfie search). Uses the prebuilt dlib-bin wheel
# instead of compiling dlib, which would run out of memory / time on Render.
# If this step fails the site still deploys; only face search stays unavailable,
# and the reason is printed in the build log.
if pip install dlib-bin==19.24.6 \
  && pip install --no-deps face_recognition==1.3.0 face_recognition_models==0.3.0 \
  && pip install numpy==2.2.1 "setuptools<81" Click "opencv-python-headless>=4.10.0.84,<5"; then
  python -c "import face_recognition, cv2; print('FACE SEARCH LIBRARIES: OK')" \
    || echo "WARNING: face libraries installed but failed to import - face search is OFF"
else
  echo "WARNING: face libraries failed to install - face search is OFF"
fi

python manage.py collectstatic --no-input
python manage.py migrate --no-input