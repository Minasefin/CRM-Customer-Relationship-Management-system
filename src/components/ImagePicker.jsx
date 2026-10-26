import { useRef } from 'react';

// Picks an image, shrinks it to at most 320px, and returns it as a data URL
// so it can be stored in the local database with no files to manage.
function shrink(file, max = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ImagePicker({ value, onChange, placeholder, shape = 'circle', label }) {
  const input = useRef(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (file) onChange(await shrink(file));
    e.target.value = '';
  };
  return (
    <div className="image-picker">
      <div className={`image-preview shape-${shape}`}>
        {value ? <img src={value} alt="" /> : <span>{placeholder}</span>}
      </div>
      <div className="image-actions">
        <button type="button" className="btn-ghost" onClick={() => input.current.click()}>
          {value ? `Change ${label}` : `Upload ${label}`}
        </button>
        {value && (
          <button type="button" className="link-btn" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
    </div>
  );
}
