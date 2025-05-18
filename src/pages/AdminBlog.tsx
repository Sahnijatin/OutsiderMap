import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    const session = supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        window.location.href = '/admin/login';
      } else {
        setUser(data.session.user);
      }
    });
    supabase.auth.onAuthStateChange((event, session) => {
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

  const handleArrayChange = (name: 'images' | 'videos' | 'reels', value: string) => {
    setForm({ ...form, [name]: value.split(',').map(v => v.trim()).filter(Boolean) });
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
      <form onSubmit={handleSubmit} className="glass-card p-6 mb-8 space-y-4">
        <div className="flex gap-4">
          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Title"
            className="flex-1 px-4 py-2 rounded border border-gray-300"
            required
          />
          <input
            name="slug"
            value={form.slug}
            onChange={handleChange}
            placeholder="Slug (unique, for URL)"
            className="flex-1 px-4 py-2 rounded border border-gray-300"
            required
          />
        </div>
        <textarea
          name="content"
          value={form.content}
          onChange={handleChange}
          placeholder="Content (HTML allowed)"
          className="w-full px-4 py-2 rounded border border-gray-300 min-h-[120px]"
        />
        <input
          name="images"
          value={form.images.join(', ')}
          onChange={e => handleArrayChange('images', e.target.value)}
          placeholder="Image URLs (comma separated)"
          className="w-full px-4 py-2 rounded border border-gray-300"
        />
        <input
          name="videos"
          value={form.videos.join(', ')}
          onChange={e => handleArrayChange('videos', e.target.value)}
          placeholder="Video URLs (comma separated, embeddable)"
          className="w-full px-4 py-2 rounded border border-gray-300"
        />
        <input
          name="reels"
          value={form.reels.join(', ')}
          onChange={e => handleArrayChange('reels', e.target.value)}
          placeholder="Reel URLs (comma separated, embeddable)"
          className="w-full px-4 py-2 rounded border border-gray-300"
        />
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