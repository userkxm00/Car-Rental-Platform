import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Field, Input, Main, PageHeader, Select } from '@kavriqo/ui';
import type { VehicleCategoryDto } from '@kavriqo/api-client';
import { ApiError, createApi } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useAgency } from '../agency/AgencyContext';

interface FormState {
  make: string;
  model: string;
  year: string;
  plateNumber: string;
  vin: string;
  color: string;
  categoryId: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

function validate(state: FormState, t: (key: string) => string): FormErrors {
  const errors: FormErrors = {};
  if (state.make.trim().length === 0) errors.make = t('fleet.validation.makeRequired');
  if (state.model.trim().length === 0) errors.model = t('fleet.validation.modelRequired');
  if (state.plateNumber.trim().length === 0)
    errors.plateNumber = t('fleet.validation.plateRequired');
  else if (!/^[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12})?$/i.test(state.plateNumber.trim())) {
    errors.plateNumber = t('fleet.validation.plateShape');
  }
  if (state.year.trim().length === 0) {
    errors.year = t('fleet.validation.yearRange');
  } else {
    const year = Number(state.year);
    if (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1) {
      errors.year = t('fleet.validation.yearRange');
    }
  }
  if (state.categoryId.length === 0) errors.categoryId = t('fleet.validation.categoryRequired');
  if (
    state.vin.trim().length > 0 &&
    !/^[A-HJ-NPR-Z0-9]{17}$/.test(state.vin.trim().toUpperCase())
  ) {
    errors.vin = t('fleet.validation.vinShape');
  }
  return errors;
}

/**
 * Vehicle create/edit form (03-D02/03-D03) with client-side validation
 * mirroring the server rules and localized messages (03-D08).
 */
export function VehicleFormPage(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const isEdit = vehicleId !== undefined;
  const { token } = useAuth();
  const { agencyId } = useAgency();
  const api = useMemo(() => createApi(token), [token]);

  const [state, setState] = useState<FormState>({
    make: '',
    model: '',
    year: '',
    plateNumber: '',
    vin: '',
    color: '',
    categoryId: '',
  });
  const [categories, setCategories] = useState<VehicleCategoryDto[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!agencyId) {
      return;
    }
    void api.categories.list(agencyId, true).then((result) => {
      setCategories(result.categories);
      setState((previous) => ({
        ...previous,
        categoryId:
          previous.categoryId.length === 0 ? (result.categories[0]?.id ?? '') : previous.categoryId,
      }));
    });
  }, [api, agencyId]);

  useEffect(() => {
    if (!isEdit || !agencyId || !vehicleId) {
      return;
    }
    void api.vehicles.get(agencyId, vehicleId).then((vehicle) => {
      setState({
        make: vehicle.make,
        model: vehicle.model,
        year: String(vehicle.year),
        plateNumber: vehicle.plateNumber,
        vin: vehicle.vin ?? '',
        color: vehicle.color ?? '',
        categoryId: vehicle.categoryId,
      });
    });
  }, [api, agencyId, isEdit, vehicleId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setState((previous) => ({ ...previous, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!agencyId) {
      return;
    }
    const nextErrors = validate(state, t);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError(t('fleet.saveFailed'));
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      categoryId: state.categoryId,
      make: state.make.trim(),
      model: state.model.trim(),
      year: Number(state.year),
      plateNumber: state.plateNumber.trim(),
      ...(state.vin.trim() ? { vin: state.vin.trim().toUpperCase() } : {}),
      ...(state.color.trim() ? { color: state.color.trim() } : {}),
    };
    if (!isEdit || !vehicleId) {
      return;
    }
    const action = isEdit
      ? api.vehicles.update(agencyId, vehicleId, payload)
      : api.vehicles.create(agencyId, payload);
    void action.then(
      () => {
        void navigate('/fleet');
        setSaving(false);
      },
      (error: unknown) => {
        setFormError(error instanceof ApiError ? error.message : t('fleet.saveFailed'));
        setSaving(false);
      },
    );
  }

  return (
    <Main>
      <PageHeader title={isEdit ? t('fleet.editTitle') : t('fleet.createTitle')} />
      <form onSubmit={submit} style={{ maxWidth: 560 }}>
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <Field label={t('fleet.make')} error={errors.make}>
          <Input value={state.make} onChange={(e) => set('make', e.target.value)} />
        </Field>
        <Field label={t('fleet.model')} error={errors.model}>
          <Input value={state.model} onChange={(e) => set('model', e.target.value)} />
        </Field>
        <Field label={t('fleet.year')} error={errors.year}>
          <Input
            inputMode="numeric"
            value={state.year}
            onChange={(e) => set('year', e.target.value)}
          />
        </Field>
        <Field label={t('fleet.plate')} error={errors.plateNumber}>
          <Input value={state.plateNumber} onChange={(e) => set('plateNumber', e.target.value)} />
        </Field>
        <Field label="VIN" error={errors.vin}>
          <Input value={state.vin} onChange={(e) => set('vin', e.target.value)} />
        </Field>
        <Field label={t('fleet.color')}>
          <Input value={state.color} onChange={(e) => set('color', e.target.value)} />
        </Field>
        <Field label={t('fleet.category')} error={errors.categoryId}>
          <Select value={state.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="kv-topbar__actions">
          <Button type="submit" disabled={saving}>
            {saving ? t('fleet.saving') : t('fleet.save')}
          </Button>
          <Link to="/fleet">
            <Button variant="secondary">{t('fleet.cancel')}</Button>
          </Link>
        </div>
      </form>
    </Main>
  );
}
