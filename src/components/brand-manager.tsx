'use client';

import { useState, useEffect, useCallback } from 'react';

interface Brand {
  id: string;
  name: string;
  slug: string;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  instagramHandle: string | null;
  createdAt: string;
}

interface BrandFormData {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  instagramHandle: string;
  logoUrl: string;
}

const EMPTY_FORM: BrandFormData = {
  name: '',
  slug: '',
  primaryColor: '#14b8a6',
  secondaryColor: '#0d9488',
  instagramHandle: '',
  logoUrl: '',
};

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function BrandManager() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BrandFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchBrands = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch('/api/brands');
      if (!res.ok) {
        setFetchError('Unable to load brands. Please refresh the page.');
        return;
      }
      const json = await res.json();
      if (json.brands) {
        setBrands(json.brands);
      }
    } catch (err) {
      console.error('Failed to fetch brands:', err instanceof Error ? err.message : err);
      setFetchError('Unable to load brands. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const handleNameChange = (name: string) => {
    const updated = { ...form, name };
    if (!editingId) {
      updated.slug = nameToSlug(name);
    }
    setForm(updated);
  };

  const updateField = (field: keyof BrandFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await fetch('/api/brands/logo', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'Upload failed' });
        return;
      }

      setForm((prev) => ({ ...prev, logoUrl: json.url }));
      setMessage({ type: 'success', text: 'Logo uploaded' });
    } catch (err) {
      console.error('Logo upload failed:', err instanceof Error ? err.message : err);
      setMessage({ type: 'error', text: 'Failed to upload logo' });
    } finally {
      setUploading(false);
    }
  };

  const openAddForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
    setFormOpen(true);
  };

  const openEditForm = (brand: Brand) => {
    setEditingId(brand.id);
    setForm({
      name: brand.name,
      slug: brand.slug,
      primaryColor: brand.primaryColor || '#14b8a6',
      secondaryColor: brand.secondaryColor || '#0d9488',
      instagramHandle: brand.instagramHandle || '',
      logoUrl: brand.logoUrl || '',
    });
    setMessage(null);
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      setMessage({ type: 'error', text: 'Name and slug are required' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const method = editingId ? 'PUT' : 'POST';
      const payload = editingId ? { id: editingId, ...form } : form;

      const res = await fetch('/api/brands', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'Save failed' });
        return;
      }

      setMessage({ type: 'success', text: editingId ? 'Brand updated' : 'Brand created' });
      setFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await fetchBrands();
    } catch (err) {
      console.error('Brand save failed:', err instanceof Error ? err.message : err);
      setMessage({ type: 'error', text: 'Failed to save brand' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/brands?id=${id}`, { method: 'DELETE' });
      const json = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: json.error || 'Delete failed' });
        return;
      }

      setDeleteConfirmId(null);
      await fetchBrands();
    } catch (err) {
      console.error('Brand delete failed:', err instanceof Error ? err.message : err);
      setMessage({ type: 'error', text: 'Failed to delete brand' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="glass-card rounded-xl border border-white/5 p-6 animate-pulse"
          >
            <div className="h-5 w-32 rounded bg-zinc-700/50" />
            <div className="mt-2 h-4 w-64 rounded bg-zinc-700/30" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Brands</h2>
          <p className="text-sm text-white mt-0.5">
            Manage your brand identities and logos
          </p>
        </div>
        <button
          onClick={openAddForm}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
        >
          Add Brand
        </button>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {fetchError}
        </div>
      )}

      {/* Brand Cards */}
      {brands.length === 0 && !formOpen && (
        <div className="glass-card rounded-xl border border-white/5 p-8 text-center">
          <p className="text-white">No brands yet. Add your first brand to get started.</p>
        </div>
      )}

      {brands.map((brand) => (
        <div
          key={brand.id}
          className="glass-card rounded-xl border border-white/5 p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Logo preview */}
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={`${brand.name} logo`}
                  className="h-12 w-12 rounded-lg object-contain bg-zinc-800/60 border border-white/5 p-1"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-800/60 border border-white/5 text-lg font-bold text-white">
                  {brand.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div>
                <h3 className="text-base font-semibold text-white">{brand.name}</h3>
                <p className="text-sm text-white">/{brand.slug}</p>
                {brand.instagramHandle && (
                  <p className="text-sm text-white mt-0.5">
                    @{brand.instagramHandle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Color swatches */}
              <div className="flex gap-1.5">
                <div
                  className="h-6 w-6 rounded-full border border-white/10"
                  style={{ backgroundColor: brand.primaryColor || '#14b8a6' }}
                  title={`Primary: ${brand.primaryColor}`}
                />
                <div
                  className="h-6 w-6 rounded-full border border-white/10"
                  style={{ backgroundColor: brand.secondaryColor || '#0d9488' }}
                  title={`Secondary: ${brand.secondaryColor}`}
                />
              </div>

              {/* Actions */}
              <button
                onClick={() => openEditForm(brand)}
                className="rounded-lg border border-white/5 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700/60 hover:text-white"
              >
                Edit
              </button>

              {deleteConfirmId === brand.id ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleDelete(brand.id)}
                    className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/30"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="rounded-lg border border-white/5 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700/60"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirmId(brand.id)}
                  className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Inline Form */}
      {formOpen && (
        <div className="glass-card rounded-xl border border-white/5 p-6 space-y-4">
          <h3 className="text-base font-semibold text-white">
            {editingId ? 'Edit Brand' : 'New Brand'}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Brand"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Slug
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => updateField('slug', e.target.value.toLowerCase())}
                placeholder="my-brand"
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
            </div>

            {/* Primary Color */}
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Primary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => updateField('primaryColor', e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-lg border border-white/5 bg-transparent"
                />
                <input
                  type="text"
                  value={form.primaryColor}
                  onChange={(e) => updateField('primaryColor', e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
            </div>

            {/* Secondary Color */}
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Secondary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.secondaryColor}
                  onChange={(e) => updateField('secondaryColor', e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded-lg border border-white/5 bg-transparent"
                />
                <input
                  type="text"
                  value={form.secondaryColor}
                  onChange={(e) => updateField('secondaryColor', e.target.value)}
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
            </div>

            {/* Instagram Handle */}
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Instagram Handle
              </label>
              <div className="flex items-center gap-0">
                <span className="flex h-[42px] items-center rounded-l-lg border border-r-0 border-white/5 bg-zinc-800/80 px-3 text-sm text-white">
                  @
                </span>
                <input
                  type="text"
                  value={form.instagramHandle}
                  onChange={(e) => updateField('instagramHandle', e.target.value)}
                  placeholder="yourbrand"
                  className="flex-1 rounded-r-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
            </div>

            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-white mb-1.5">
                Logo
              </label>
              <div className="flex items-center gap-3">
                {form.logoUrl && (
                  <img
                    src={form.logoUrl}
                    alt="Logo preview"
                    className="h-10 w-10 rounded-lg object-contain bg-zinc-800/60 border border-white/5 p-0.5"
                  />
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-white/10 bg-zinc-800/40 px-4 py-2.5 text-sm text-white transition hover:border-teal-500/30 hover:text-white">
                    {uploading ? 'Uploading...' : form.logoUrl ? 'Change logo' : 'Upload logo'}
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Form message */}
          {message && (
            <p
              className={`text-sm ${
                message.type === 'success' ? 'text-teal-400' : 'text-red-400'
              }`}
            >
              {message.text}
            </p>
          )}

          {/* Form Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : editingId ? 'Update Brand' : 'Create Brand'}
            </button>
            <button
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
                setForm(EMPTY_FORM);
                setMessage(null);
              }}
              className="rounded-lg border border-white/5 bg-zinc-800/60 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700/60 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
