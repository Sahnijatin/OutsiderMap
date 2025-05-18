import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  images: string[];
  videos: string[];
  reels: string[];
  created_at: string;
}

const AdminBlog: React.FC = () => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState<Omit<BlogPost, 'id' | 'created_at'>>({
    slug: '',
    title: '',
    content: '',
    images: [],
    videos: [],
    reels: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [reelUploading, setReelUploading] = useState(false);
  const [reelUploadError, setReelUploadError] = useState<string | null>(null);
  const reelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = '/admin/login';
      } else {
        setUser(data.session.user);
      }
    });
    supabase.auth.onAuthStateChange((_, session) => {
      if (!session) {
        window.location.href = '/admin/login';
      } else {
        setUser(session.user);
      }
    });
    fetchPosts();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin/login';
  };

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setPosts(data || []);
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleEdit = (post: BlogPost) => {
    setEditing(post);
    setForm({
      slug: post.slug,
      title: post.title,
      content: post.content,
      images: post.images || [],
      videos: post.videos || [],
      reels: post.reels || [],
    });
    setSuccess(null);
    setError(null);
  };

  const handleCancel = () => {
    setEditing(null);
    setForm({ slug: '', title: '', content: '', images: [], videos: [], reels: [] });
    setSuccess(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    if (!form.slug || !form.title) {
      setError('Slug and title are required.');
      setLoading(false);
      return;
    }
    let result;
    if (editing) {
      result = await supabase.from('blog_posts').update(form).eq('id', editing.id).select();
    } else {
      result = await supabase.from('blog_posts').insert([form]).select();
    }
    if (result.error) {
      setError(result.error.message);
    } else {
      setSuccess('Saved successfully!');
      fetchPosts();
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
      const filePath = `blog-images/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
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

  // Drag-and-drop video upload handler
  const handleVideoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setVideoUploadError(null);
    setVideoUploading(true);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const filePath = `blog-videos/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('blog-media').upload(filePath, file, { upsert: false });
      if (error) {
        setVideoUploadError(error.message);
        setVideoUploading(false);
        return;
      }
      const { data } = supabase.storage.from('blog-media').getPublicUrl(filePath);
      if (data?.publicUrl) {
        setForm(prev => ({ ...prev, videos: [...prev.videos, data.publicUrl] }));
      }
    }
    setVideoUploading(false);
  };

  const handleVideoRemove = (url: string) => {
    setForm(prev => ({ ...prev, videos: prev.videos.filter(v => v !== url) }));
  };

  // Drag-and-drop reel upload handler
  const handleReelDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setReelUploadError(null);
    setReelUploading(true);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const filePath = `blog-reels/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('blog-media').upload(filePath, file, { upsert: false });
      if (error) {
        setReelUploadError(error.message);
        setReelUploading(false);
        return;
      }
      const { data } = supabase.storage.from('blog-media').getPublicUrl(filePath);
      if (data?.publicUrl) {
        setForm(prev => ({ ...prev, reels: [...prev.reels, data.publicUrl] }));
      }
    }
    setReelUploading(false);
  };

  const handleReelRemove = (url: string) => {
    setForm(prev => ({ ...prev, reels: prev.reels.filter(r => r !== url) }));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin: Blog Posts</h1>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user.email}</span>
            <button className="button-secondary" onClick={handleLogout}>Logout</button>
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} className="glass-card p-6 mb-8 space-y-6">
        <div className="flex gap-4 mb-4">
          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Title"
            className="flex-1 px-4 py-2 rounded border border-gray-300 bg-dark-900 text-white placeholder-gray-400"
            required
          />
          <input
            name="slug"
            value={form.slug}
            onChange={handleChange}
            placeholder="Slug (unique, for URL)"
            className="flex-1 px-4 py-2 rounded border border-gray-300 bg-dark-900 text-white placeholder-gray-400"
            required
          />
        </div>
        <textarea
          name="content"
          value={form.content}
          onChange={handleChange}
          placeholder="Content (HTML allowed)"
          className="w-full px-4 py-2 rounded border border-gray-300 min-h-[120px] bg-dark-900 text-white placeholder-gray-400 mb-4"
        />
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
                const filePath = `blog-images/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
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
        <div>
          <label className="block font-medium mb-2">Videos</label>
          <div
            className="w-full min-h-[80px] border-2 border-dashed border-gray-400 rounded-lg flex flex-wrap items-center gap-2 p-2 mb-2 bg-black/10 cursor-pointer"
            onDrop={handleVideoDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => videoInputRef.current?.click()}
          >
            {form.videos.map((vid) => (
              <div key={vid} className="relative group">
                <video src={vid} controls className="w-24 h-20 object-cover rounded shadow" />
                <button
                  type="button"
                  className="absolute top-0 right-0 bg-black/70 text-white rounded-full p-1 text-xs opacity-80 group-hover:opacity-100"
                  onClick={e => { e.stopPropagation(); handleVideoRemove(vid); }}
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
            accept="video/*"
            multiple
            ref={videoInputRef}
            style={{ display: 'none' }}
            onChange={async (e) => {
              if (!e.target.files) return;
              setVideoUploadError(null);
              setVideoUploading(true);
              const files = Array.from(e.target.files);
              for (const file of files) {
                const ext = file.name.split('.').pop();
                const filePath = `blog-videos/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
                const { error } = await supabase.storage.from('blog-media').upload(filePath, file, { upsert: false });
                if (error) {
                  setVideoUploadError(error.message);
                  setVideoUploading(false);
                  return;
                }
                const { data } = supabase.storage.from('blog-media').getPublicUrl(filePath);
                if (data?.publicUrl) {
                  setForm(prev => ({ ...prev, videos: [...prev.videos, data.publicUrl] }));
                }
              }
              setVideoUploading(false);
            }}
          />
          {videoUploading && <div className="text-primary-500 text-sm">Uploading...</div>}
          {videoUploadError && <div className="text-error-500 text-sm">{videoUploadError}</div>}
        </div>
        <div>
          <label className="block font-medium mb-2">Reels</label>
          <div
            className="w-full min-h-[80px] border-2 border-dashed border-gray-400 rounded-lg flex flex-wrap items-center gap-2 p-2 mb-2 bg-black/10 cursor-pointer"
            onDrop={handleReelDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => reelInputRef.current?.click()}
          >
            {form.reels.map((reel) => (
              <div key={reel} className="relative group">
                <video src={reel} controls className="w-24 h-20 object-cover rounded shadow" />
                <button
                  type="button"
                  className="absolute top-0 right-0 bg-black/70 text-white rounded-full p-1 text-xs opacity-80 group-hover:opacity-100"
                  onClick={e => { e.stopPropagation(); handleReelRemove(reel); }}
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
            accept="video/*"
            multiple
            ref={reelInputRef}
            style={{ display: 'none' }}
            onChange={async (e) => {
              if (!e.target.files) return;
              setReelUploadError(null);
              setReelUploading(true);
              const files = Array.from(e.target.files);
              for (const file of files) {
                const ext = file.name.split('.').pop();
                const filePath = `blog-reels/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
                const { error } = await supabase.storage.from('blog-media').upload(filePath, file, { upsert: false });
                if (error) {
                  setReelUploadError(error.message);
                  setReelUploading(false);
                  return;
                }
                const { data } = supabase.storage.from('blog-media').getPublicUrl(filePath);
                if (data?.publicUrl) {
                  setForm(prev => ({ ...prev, reels: [...prev.reels, data.publicUrl] }));
                }
              }
              setReelUploading(false);
            }}
          />
          {reelUploading && <div className="text-primary-500 text-sm">Uploading...</div>}
          {reelUploadError && <div className="text-error-500 text-sm">{reelUploadError}</div>}
        </div>
        <div className="flex gap-4">
          <button
            type="submit"
            className="button-primary"
            disabled={loading}
          >
            {editing ? 'Update' : 'Create'} Blog Post
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
      <h2 className="text-2xl font-bold mb-4">Existing Blog Posts</h2>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid gap-4">
          {posts.map(post => (
            <div key={post.id} className="glass-card p-4 flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-bold text-lg">{post.title}</div>
                <div className="text-gray-400 text-sm">/{post.slug}</div>
                <div className="text-xs text-gray-500">{new Date(post.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-2 mt-2 md:mt-0">
                <button className="button-secondary" onClick={() => handleEdit(post)}>
                  Edit
                </button>
                <a className="button-primary" href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                  View
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminBlog; 