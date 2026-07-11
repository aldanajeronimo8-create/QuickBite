import { Database, Globe2, KeyRound, Mail, ShieldCheck, UploadCloud } from 'lucide-react';
import { appConfig } from '../../config/appConfig';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const steps = [
  {
    icon: Database,
    title: 'Base de datos',
    text: 'Elige Supabase y crea tu propio proyecto. No hay Project ID, URL ni buckets heredados.',
  },
  {
    icon: KeyRound,
    title: 'Credenciales',
    text: 'Copia solo la URL publica y la anon key en .env. Las service keys quedan fuera del frontend.',
  },
  {
    icon: ShieldCheck,
    title: 'Primer administrador',
    text: 'Define VITE_ADMIN_INVITE_CODE o crea el primer admin desde un flujo server-side controlado.',
  },
  {
    icon: Globe2,
    title: 'Dominio',
    text: 'Configura dominio, subdominios, CDN y SSL mediante variables de entorno.',
  },
  {
    icon: Mail,
    title: 'Correo',
    text: 'Conecta SMTP o proveedor transaccional para recuperacion de cuenta y notificaciones.',
  },
  {
    icon: UploadCloud,
    title: 'Almacenamiento',
    text: 'Configura un bucket propio para imagenes y recibos, con politicas RLS dedicadas.',
  },
];

export function SetupWizardPage() {
  return (
    <main className="min-h-screen bg-[#fff7e8] px-4 py-8 text-[#14213d]">
      <section className="mx-auto max-w-5xl">
        <Badge className="mb-4 bg-orange-100 text-orange-800">Primer inicio</Badge>
        <h1 className="text-3xl font-black sm:text-4xl">Configuracion inicial</h1>
        <p className="mt-3 max-w-3xl text-slate-700">
          QuickBite no encontro una configuracion completa para produccion. Puedes conectar un
          proyecto Supabase existente o crear uno nuevo manualmente, y completar las variables de
          entorno antes de habilitar el modo productivo.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="rounded-lg border-orange-100 bg-white">
              <CardHeader>
                <Icon className="h-6 w-6 text-orange-600" aria-hidden="true" />
                <CardTitle className="text-lg">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-700">{text}</CardContent>
            </Card>
          ))}
        </div>

        <section className="mt-8 rounded-lg bg-white p-5 shadow-sm ring-1 ring-orange-100">
          <h2 className="font-black">Variables minimas</h2>
          <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-4 text-sm text-slate-100">
            {`VITE_RUNTIME_MODE=supabase
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
VITE_PUBLIC_APP_URL=${appConfig.publicAppUrl || 'https://tu-dominio.com'}`}
          </pre>
        </section>
      </section>
    </main>
  );
}
