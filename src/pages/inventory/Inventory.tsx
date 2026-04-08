import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Search, Filter, Grid, List, Car, AlertTriangle, Clock, Edit, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from '@/components/ui/Toast'
import { formatCurrency } from '@/utils/format'
import type { Vehicle } from '@/types'

function VehicleCard({ vehicle, onEdit }: { vehicle: Vehicle; onEdit: () => void }) {
  const days = vehicle.days_in_stock ?? 0
  const daysColor = days > 60 ? 'text-red-400' : days > 30 ? 'text-yellow-400' : 'text-[#39FF14]'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#111] border border-[#222] rounded-xl overflow-hidden hover:border-[#39FF14]/30 transition-all duration-300 group"
    >
      {/* Photo */}
      <div className="relative h-44 bg-[#1A1A1A] overflow-hidden">
        {vehicle.photos?.[0] ? (
          <img
            src={vehicle.photos[0]}
            alt={`${vehicle.brand} ${vehicle.model}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car size={48} className="text-[#333]" />
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-2 left-2">
          <Badge
            variant={vehicle.status === 'available' ? 'neon' : vehicle.status === 'reserved' ? 'warning' : 'default'}
          >
            {vehicle.status === 'available' ? 'Disponível' :
             vehicle.status === 'reserved' ? 'Reservado' :
             vehicle.status === 'sold' ? 'Vendido' : 'Manutenção'}
          </Badge>
        </div>
        {/* Days warning */}
        {days > 30 && (
          <div className="absolute top-2 right-2">
            <Badge variant={days > 60 ? 'danger' : 'warning'}>
              <AlertTriangle size={10} /> {days}d
            </Badge>
          </div>
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit}><Edit size={14} /> Editar</Button>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-xs text-[#555] uppercase tracking-wider">{vehicle.brand}</p>
            <h3 className="font-bold text-white">{vehicle.model}</h3>
            {vehicle.version && <p className="text-xs text-[#A0A0A0]">{vehicle.version}</p>}
          </div>
          <div className="text-right">
            {vehicle.promotional_price ? (
              <>
                <p className="text-xs text-[#555] line-through">{formatCurrency(vehicle.sale_price ?? 0)}</p>
                <p className="font-bold text-[#39FF14]">{formatCurrency(vehicle.promotional_price)}</p>
              </>
            ) : (
              <p className="font-bold text-white">{formatCurrency(vehicle.sale_price ?? 0)}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-[#555]">
          <span>{vehicle.year_model}</span>
          <span>·</span>
          <span>{vehicle.km?.toLocaleString('pt-BR')} km</span>
          <span>·</span>
          <span>{vehicle.fuel}</span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className={`text-xs flex items-center gap-1 ${daysColor}`}>
            <Clock size={11} /> {days} dias no estoque
          </span>
          {vehicle.color && (
            <span className="text-xs text-[#555]">{vehicle.color}</span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

const BRANDS = ['BMW', 'Porsche', 'Mercedes-Benz', 'Audi', 'Land Rover', 'Volvo', 'Outros']
const FUELS = ['Gasolina', 'Diesel', 'Flex', 'Elétrico', 'Híbrido']
const STATUS_OPTS = [
  { value: '', label: 'Todos' },
  { value: 'available', label: 'Disponível' },
  { value: 'reserved', label: 'Reservado' },
  { value: 'sold', label: 'Vendido' },
]

export default function Inventory() {
  const { store } = useAuthStore()
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles', store?.id, search, filterBrand, filterStatus],
    queryFn: async () => {
      let query = supabase
        .from('vehicles')
        .select('*')
        .eq('store_id', store!.id)
        .order('created_at', { ascending: false })

      if (search) query = query.or(`brand.ilike.%${search}%,model.ilike.%${search}%,plate.ilike.%${search}%`)
      if (filterBrand) query = query.eq('brand', filterBrand)
      if (filterStatus) query = query.eq('status', filterStatus)

      const { data } = await query
      return (data ?? []) as Vehicle[]
    },
    enabled: !!store?.id,
  })

  const stats = {
    total: vehicles?.length ?? 0,
    available: vehicles?.filter(v => v.status === 'available').length ?? 0,
    reserved: vehicles?.filter(v => v.status === 'reserved').length ?? 0,
    avgDays: vehicles?.length
      ? Math.round((vehicles.reduce((s, v) => s + (v.days_in_stock ?? 0), 0)) / vehicles.length)
      : 0,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Estoque</h1>
          <p className="text-sm text-[#555]">{stats.total} veículos cadastrados</p>
        </div>
        <Button size="sm">
          <Plus size={14} /> Cadastrar Veículo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Disponíveis', value: stats.available, color: 'text-[#39FF14]' },
          { label: 'Reservados', value: stats.reserved, color: 'text-yellow-400' },
          { label: 'Média no estoque', value: `${stats.avgDays}d`, color: stats.avgDays > 30 ? 'text-red-400' : 'text-[#A0A0A0]' },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <p className="text-xs text-[#555]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
          <input
            type="text"
            placeholder="Buscar por marca, modelo, placa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-[#1A1A1A] border border-[#222] text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-[#39FF14]"
          />
        </div>
        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#1A1A1A] border border-[#222] text-sm text-white focus:outline-none focus:border-[#39FF14]"
        >
          <option value="">Todas as marcas</option>
          {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-9 px-3 rounded-lg bg-[#1A1A1A] border border-[#222] text-sm text-white focus:outline-none focus:border-[#39FF14]"
        >
          {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="flex items-center gap-1 bg-[#1A1A1A] border border-[#222] rounded-lg p-1">
          <button
            onClick={() => setView('grid')}
            className={`p-1.5 rounded ${view === 'grid' ? 'bg-[#39FF14]/10 text-[#39FF14]' : 'text-[#555]'}`}
          >
            <Grid size={14} />
          </button>
          <button
            onClick={() => setView('list')}
            className={`p-1.5 rounded ${view === 'list' ? 'bg-[#39FF14]/10 text-[#39FF14]' : 'text-[#555]'}`}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Vehicle grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden bg-[#111] border border-[#222]">
              <Skeleton className="h-44 rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : vehicles?.length === 0 ? (
        <div className="text-center py-20 text-[#555]">
          <Car size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium text-[#333]">Nenhum veículo encontrado</p>
          <p className="text-sm mt-1">Cadastre seu primeiro veículo no estoque</p>
          <Button className="mt-4" size="sm"><Plus size={14} /> Cadastrar agora</Button>
        </div>
      ) : (
        <div className={view === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
          : 'space-y-3'
        }>
          {vehicles?.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} onEdit={() => {}} />
          ))}
        </div>
      )}
    </div>
  )
}
