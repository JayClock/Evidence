import type { Action, Entity } from '@hateoas-ts/resource';
import ShadcnForm from '@rjsf/shadcn';
import validator from '@rjsf/validator-ajv8';
import { type ReactNode, useMemo } from 'react';
import * as z from 'zod';

type FormData = Record<string, unknown>;
type ActionUiSchema = Record<string, unknown>;
type JsonSchema = Record<string, unknown>;

type ActionFormProps<TEntity extends Entity> = {
  action: Action<TEntity>;
  formData: FormData;
  onFormDataChange: (formData: FormData) => void;
  onSubmit: (formData: FormData) => void | Promise<void>;
  uiSchema?: ActionUiSchema;
  children?: ReactNode;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toFormData = (value: unknown): FormData => (isRecord(value) ? value : {});

function toJsonSchema<TEntity extends Entity>(
  action: Action<TEntity>,
): JsonSchema {
  const schema = z.toJSONSchema(action.formSchema as unknown as z.ZodType, {
    target: 'draft-7',
    unrepresentable: 'any',
  }) as JsonSchema;

  schema.title = action.title ?? 'Form';
  return schema;
}

export function ActionForm<TEntity extends Entity>({
  action,
  formData,
  onFormDataChange,
  onSubmit,
  uiSchema,
  children,
}: ActionFormProps<TEntity>) {
  const jsonSchema = useMemo(() => toJsonSchema(action), [action]);
  const mergedUiSchema = useMemo(
    () => ({
      'ui:submitButtonOptions': { norender: children !== undefined },
      ...uiSchema,
    }),
    [children, uiSchema],
  );

  return (
    <ShadcnForm
      schema={jsonSchema}
      uiSchema={mergedUiSchema}
      validator={validator}
      formData={formData}
      noHtml5Validate
      showErrorList={false}
      onChange={(event) => {
        onFormDataChange(toFormData(event.formData));
      }}
      onSubmit={(event) => {
        void onSubmit(toFormData(event.formData));
      }}
    >
      {children}
    </ShadcnForm>
  );
}

export type { ActionFormProps };
