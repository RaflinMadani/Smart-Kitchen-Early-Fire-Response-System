'use strict';
const { z } = require('zod');

const ingestSchema = z.object({
  id_device: z.string().min(1).max(20),
  suhu:      z.number().min(-40).max(80).nullable().optional().default(null),
  rh:        z.number().min(0).max(100).nullable().optional().default(null),
  mq2_adc:   z.number().int().min(0).max(4095),
  api:       z.union([z.literal(0), z.literal(1)]),
  kipas:     z.union([z.literal(0), z.literal(1)]).optional(),
  pompa:     z.union([z.literal(0), z.literal(1)]).optional(),
});

const controlSchema = z.object({
  kipas:  z.enum(['AUTO', 'ON', 'OFF']).optional(),
  pompa:  z.enum(['AUTO', 'ON', 'OFF']).optional(),
  buzzer: z.enum(['AUTO', 'MUTE', 'ON']).optional(),
}).refine(
  data => data.kipas !== undefined || data.pompa !== undefined || data.buzzer !== undefined,
  { message: 'At least one of kipas, pompa, buzzer must be provided' }
);

module.exports = { ingestSchema, controlSchema };
