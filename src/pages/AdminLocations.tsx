import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface BlogPost {
  id: string;
  title: string;
}

interface Location {
  id: string;
  name: string;
  description: string;
  type: string;
  price_range: string;
  rating: number;
  images: string[];
  blog_post_id: string | null;
}

const AdminLocations: React.FC = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState<Omit<Location, 'id'>>({
    name: '',
    description: '',
    type: '',
    price_range: '',
    rating: 0,
    images: [],
    blog_post_id: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetchLocations();
    fetchBlogPosts();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('locations').select('*').order('name');
    if (error) setError(error.message);
    else setLocations(data || []);
    setLoading(false);
  };

  const fetchBlogPosts = async () => {
    const { data, error } = await supabase.from('blog_posts').select('id, title').order('title');
    if (!error) setBlogPosts(data || []);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleEdit = (loc: Location) => {
    setEditing(loc);
    setForm({
      name: loc.name,
      description: loc.description,
      type: loc.type,
      price_range: loc.price_range,
      rating: loc.rating,
      images: loc.images || [],
      blog_post_id: loc.blog_post_id || '',
    });
    setSuccess(null);
    setError(null);
  };

  const handleCancel = () => {
    setEditing(null);
    setForm({ name: '', description: '', type: '', price_range: '', rating: 0, images: [], blog_post_id: null });
    setSuccess(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    if (!form.name) {
      setError('Name is required.');
      setLoading(false);
      return;
    }
    let result;
    if (editing) {
      result = await supabase.from('locations').update(form).eq('id', editing.id).select();
    } else {
      result = await supabase.from('locations').insert([form]).select();
    }
    if (result.error) {
      setError(result.error.message);
    } else {
      setSuccess('Saved successfully!');
      fetchLocations();
      handleCancel();
    }
    setLoading(false);
  };

  // Drag-and-drop image upload handler
  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setImageUploadError(null);
    setImageUploading(true);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const filePath = `location-images/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('blog-media').upload(filePath, file, { upsert: false });
      if (error) {
        setImageUploadError(error.message);
        setImageUploading(false);
        return;
      }
      const { data } = supabase.storage.from('blog-media').getPublicUrl(filePath);
      if (data?.publicUrl) {
        setForm(prev => ({ ...prev, images: [...prev.images, data.publicUrl] }));
      }
    }
    setImageUploading(false);
  };

  const handleImageRemove = (url: string) => {
    setForm(prev => ({ ...prev, images: prev.images.filter(img => img !== url) }));
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this location?')) return;
    setLoading(true);
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) setError(error.message);
    else fetchLocations();
    setLoading(false);
  };

  return (
    <div className="container mx-auto px-4 py-8 mt-8">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">Admin: Locations</h1>
      </div>
      <form onSubmit={handleSubmit} className="glass-card p-6 mb-8 space-y-6">
        <div className="flex gap-4 mb-4">
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Location Name"
            className="flex-1 px-4 py-2 rounded border border-gray-300 bg-dark-900 text-white placeholder-gray-400"
            required
          />
          <input
            name="type"
            value={form.type}
            onChange={handleChange}
            placeholder="Type (e.g. Cafe, Park)"
            className="flex-1 px-4 py-2 rounded border border-gray-300 bg-dark-900 text-white placeholder-gray-400"
          />
          <input
            name="price_range"
            value={form.price_range}
            onChange={handleChange}
            placeholder="Price Range (e.g. Budget)"
            className="flex-1 px-4 py-2 rounded border border-gray-300 bg-dark-900 text-white placeholder-gray-400"
          />
        </div>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="Description"
          className="w-full px-4 py-2 rounded border border-gray-300 min-h-[80px] bg-dark-900 text-white placeholder-gray-400 mb-4"
        />
        <div className="flex gap-4 mb-4">
          <input
            name="rating"
            type="number"
            value={form.rating}
            onChange={handleChange}
            placeholder="Rating"
            className="flex-1 px-4 py-2 rounded border border-gray-300 bg-dark-900 text-white placeholder-gray-400"
            min={0}
            max={5}
            step={0.1}
          />
          <select
            name="blog_post_id"
            value={form.blog_post_id || ''}
            onChange={handleChange}
            className="flex-1 px-4 py-2 rounded border border-gray-300 bg-dark-900 text-white"
          >
            <option value="">No Blog Post Linked</option>
            {blogPosts.map(bp => (
              <option key={bp.id} value={bp.id}>{bp.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium mb-2">Images</label>
          <div
            className="w-full min-h-[80px] border-2 border-dashed border-gray-400 rounded-lg flex flex-wrap items-center gap-2 p-2 mb-2 bg-black/10 cursor-pointer"
            onDrop={handleImageDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => imageInputRef.current?.click()}
          >
            {form.images.map((img) => (
              <div key={img} className="relative group">
                <img src={img} alt="uploaded" className="w-20 h-20 object-cover rounded shadow" />
                <button
                  type="button"
                  className="absolute top-0 right-0 bg-black/70 text-white rounded-full p-1 text-xs opacity-80 group-hover:opacity-100"
                  onClick={e => { e.stopPropagation(); handleImageRemove(img); }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
            <span className="text-gray-400 text-sm">Drag & drop or click to upload</span>
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            ref={imageInputRef}
            style={{ display: 'none' }}
            onChange={async (e) => {
              if (!e.target.files) return;
              setImageUploadError(null);
              setImageUploading(true);
              const files = Array.from(e.target.files);
              for (const file of files) {
                const ext = file.name.split('.').pop();
                const filePath = `location-images/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
                const { error } = await supabase.storage.from('blog-media').upload(filePath, file, { upsert: false });
                if (error) {
                  setImageUploadError(error.message);
                  setImageUploading(false);
                  return;
                }
                const { data } = supabase.storage.from('blog-media').getPublicUrl(filePath);
                if (data?.publicUrl) {
                  setForm(prev => ({ ...prev, images: [...prev.images, data.publicUrl] }));
                }
              }
              setImageUploading(false);
            }}
          />
          {imageUploading && <div className="text-primary-500 text-sm">Uploading...</div>}
          {imageUploadError && <div className="text-error-500 text-sm">{imageUploadError}</div>}
        </div>
        <div className="flex gap-4">
          <button
            type="submit"
            className="button-primary"
            disabled={loading}
          >
            {editing ? 'Update' : 'Create'} Location
          </button>
          {editing && (
            <button type="button" className="button-secondary" onClick={handleCancel} disabled={loading}>
              Cancel
            </button>
          )}
        </div>
        {error && <div className="text-error-500">{error}</div>}
        {success && <div className="text-success-500">{success}</div>}
      </form>
      <h2 className="text-2xl font-bold mb-4">Existing Locations</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid gap-4">
          {locations.map(loc => (
            <div key={loc.id} className="glass-card p-4 flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-bold text-lg">{loc.name}</div>
                <div className="text-gray-400 text-sm">{loc.type} | {loc.price_range}</div>
                <div className="text-xs text-gray-500">Rating: {loc.rating}</div>
                <div className="text-xs text-gray-500">{loc.description}</div>
                {loc.blog_post_id && <div className="text-xs text-primary-500">Linked to blog post</div>}
              </div>
              <div className="flex gap-2 mt-2 md:mt-0">
                <button className="button-secondary" onClick={() => handleEdit(loc)}>
                  Edit
                </button>
                <button className="button-secondary" onClick={() => handleDelete(loc.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminLocations; 