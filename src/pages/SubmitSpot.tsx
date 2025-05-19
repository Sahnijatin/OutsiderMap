import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader } from 'lucide-react';

interface FormData {
  name: string;
  description: string;
  address: string;
  vibe: string;
  type: string;
  priceRange: string;
  openingHours: string;
  contactInfo: string;
  images: FileList | null;
}

const initialFormData: FormData = {
  name: '',
  description: '',
  address: '',
  vibe: '',
  type: '',
  priceRange: '',
  openingHours: '',
  contactInfo: '',
  images: null,
};

function SubmitSpot() {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFormData(prev => ({ ...prev, images: e.target.files }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      // Upload images first
      let imageUrls: string[] = [];
      if (formData.images && formData.images.length > 0) {
        for (let i = 0; i < formData.images.length; i++) {
          const file = formData.images[i];
          const fileExt = file.name.split('.').pop();
          const fileName = `${Math.random()}.${fileExt}`;
          const filePath = `spot-images/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('spots')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('spots')
            .getPublicUrl(filePath);

          imageUrls.push(publicUrl);
        }
      }

      // Submit spot data
      const { error: submitError } = await supabase
        .from('spots')
        .insert([
          {
            name: formData.name,
            description: formData.description,
            address: formData.address,
            vibe: formData.vibe,
            type: formData.type,
            price_range: formData.priceRange,
            opening_hours: formData.openingHours,
            contact_info: formData.contactInfo,
            images: imageUrls,
            status: 'pending', // For admin review
          },
        ]);

      if (submitError) throw submitError;

      setSuccess(true);
      setFormData(initialFormData);
    } catch (err) {
      console.error('Error submitting spot:', err);
      setError('Failed to submit spot. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-4xl font-bold mb-8 gradient-text">Submit a Spot</h1>
      
      {error && (
        <div className="bg-error-500/20 border border-error-500 text-error-500 rounded-lg p-4 mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success-500/20 border border-success-500 text-success-500 rounded-lg p-4 mb-6">
          Thank you for your submission! We'll review it and add it to our collection soon.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass-card p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Name of the Place *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
                placeholder="Enter the name of the place"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Description *</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
                rows={4}
                className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
                placeholder="Describe what makes this place special"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Address *</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
                placeholder="Enter the full address"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Vibe *</label>
                <select
                  name="vibe"
                  value={formData.vibe}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select a vibe</option>
                  <option value="chill">Chill</option>
                  <option value="artsy">Artsy</option>
                  <option value="wild">Wild</option>
                  <option value="romantic">Romantic</option>
                  <option value="foodie">Foodie</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Type *</label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select a type</option>
                  <option value="cafe">Cafe</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="bar">Bar</option>
                  <option value="park">Park</option>
                  <option value="museum">Museum</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Price Range *</label>
                <select
                  name="priceRange"
                  value={formData.priceRange}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select price range</option>
                  <option value="budget">Budget (₹)</option>
                  <option value="moderate">Moderate (₹₹)</option>
                  <option value="expensive">Expensive (₹₹₹)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Opening Hours</label>
                <input
                  type="text"
                  name="openingHours"
                  value={formData.openingHours}
                  onChange={handleChange}
                  className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g., 10 AM - 10 PM"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Contact Information</label>
              <input
                type="text"
                name="contactInfo"
                value={formData.contactInfo}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
                placeholder="Phone number or email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Images</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageChange}
                className="w-full px-4 py-2 rounded-lg bg-dark-700 border border-dark-600 focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-sm text-gray-400 mt-1">
                Upload up to 5 images (max 5MB each)
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary-500 text-white py-3 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center">
              <Loader className="w-5 h-5 animate-spin mr-2" />
              Submitting...
            </span>
          ) : (
            'Submit Spot'
          )}
        </button>
      </form>
    </div>
  );
}

export default SubmitSpot;