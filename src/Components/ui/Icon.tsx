import {
  AlertCircle, ArrowDownLeft, ArrowLeft, ArrowUpRight,
  Bell, Building2, Calendar, CalendarPlus, Car, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Clock, CreditCard,
  Coins, Eye, Filter, Flame, Gift, Globe, Heart, Home, Info,
  Landmark, Lock, MessageSquare, Mic, MoreHorizontal, PenLine,
  Phone, PieChart, Plus, Receipt, RefreshCcw, Repeat,
  Search, Send, Share2, Shield, ShoppingBag, ShoppingCart,
  SlidersHorizontal, Sparkles, Star, Tag, Target,
  TrendingDown, TrendingUp, UtensilsCrossed, Users, UserPlus,
  Wallet, X, Zap, Scissors,
} from 'lucide-react-native';
import React from 'react';

const MAP: Record<string, any> = {
  Home,
  Wallet,
  Receipt,
  PieChart,
  Bell,
  Plus,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ArrowLeft,
  RefreshCcw,
  Sparkles,
  Send,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  ShoppingBag,
  ShoppingCart,
  Calendar,
  CalendarPlus,
  Users,
  UserPlus,
  Tag,
  CreditCard,
  Phone,
  Landmark,
  Building2,
  TrendingUp,
  TrendingDown,
  Check,
  CheckCircle2,
  X,
  PenLine,
  MoreHorizontal,
  Target,
  UtensilsCrossed,
  Car,
  Zap,
  SlidersHorizontal,
  Eye,
  Share2,
  Mic,
  Lock,
  Coins,
  Repeat,
  Filter,
  MessageSquare,
  AlertCircle,
  Info,
  Gift,
  Globe,
  Clock,
  Flame,
  Shield,
  Star,
  Heart,
  Scissors,
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function Icon({name, size = 24, color = '#F2F4F5', strokeWidth = 1.9}: IconProps) {
  const LucideIcon = MAP[name];
  if (!LucideIcon) {
    return null;
  }
  return <LucideIcon size={size} color={color} strokeWidth={strokeWidth} />;
}
