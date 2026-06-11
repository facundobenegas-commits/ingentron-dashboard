import React, { useState, useEffect } from 'react';
import { User, UserPermissions } from '../types';

interface UserManagementProps {
  token: string;
  currentUser: User | null;
}

export const UserManagement: React.FC<UserManagementProps> = ({ token, currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states for creating a new user
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'custom'>('custom');
  const [newPermissions, setNewPermissions] = useState<UserPermissions>({
    dashboard: { visible: true, writable: false },
    stockExpiration: { visible: true, writable: false },
    usersManagement: { visible: false, writable: false }
  });

  // Edit / Password Reset states
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/beta/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'No se pudieron cargar los usuarios.');
      }
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  // Flash message helpers
  const triggerSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  const triggerError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const username = newUsername.trim();
    const displayName = newDisplayName.trim();

    if (!username || !displayName || !newPassword) {
      triggerError('Todos los campos son requeridos para crear un usuario.');
      return;
    }

    if (newPassword.length < 5) {
      triggerError('La contraseña debe tener al menos 5 caracteres.');
      return;
    }

    try {
      const response = await fetch('/beta/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username,
          displayName,
          password: newPassword,
          role: newRole,
          permissions: newPermissions
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al crear el usuario.');
      }

      triggerSuccess(`Usuario "${data.username}" creado correctamente.`);
      setShowAddForm(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setNewRole('custom');
      setNewPermissions({
        dashboard: { visible: true, writable: false },
        stockExpiration: { visible: true, writable: false },
        usersManagement: { visible: false, writable: false }
      });
      fetchUsers();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleUpdatePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      const response = await fetch(`/beta/api/users/${editingUser.username}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          role: editingUser.role,
          permissions: editingUser.permissions
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar permisos.');
      }

      triggerSuccess(`Permisos de "${data.username}" actualizados correctamente.`);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser) return;

    if (newPasswordVal.length < 5) {
      triggerError('La contraseña debe tener al menos 5 caracteres.');
      return;
    }

    try {
      const response = await fetch(`/beta/api/users/${resetPasswordUser.username}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          password: newPasswordVal
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al reestablecer contraseña.');
      }

      triggerSuccess(`Contraseña de "${resetPasswordUser.username}" restablecida correctamente.`);
      setResetPasswordUser(null);
      setNewPasswordVal('');
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (currentUser?.username.toLowerCase() === username.toLowerCase()) {
      triggerError('No puedes eliminar tu propio usuario.');
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea eliminar al usuario "${username}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/beta/api/users/${username}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al eliminar el usuario.');
      }

      triggerSuccess(`Usuario "${username}" eliminado correctamente.`);
      fetchUsers();
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handlePermissionToggle = (module: keyof UserPermissions, field: 'visible' | 'writable') => {
    if (!editingUser) return;
    const currentPerm = editingUser.permissions[module];
    const updated = {
      ...editingUser,
      permissions: {
        ...editingUser.permissions,
        [module]: {
          ...currentPerm,
          [field]: !currentPerm[field]
        }
      }
    };
    // Force visible if writable is checked
    if (field === 'writable' && !currentPerm.writable) {
      updated.permissions[module].visible = true;
    }
    setEditingUser(updated);
  };

  const handleNewPermissionToggle = (module: keyof UserPermissions, field: 'visible' | 'writable') => {
    const currentPerm = newPermissions[module];
    const updatedVal = !currentPerm[field];
    
    const updated = {
      ...newPermissions,
      [module]: {
        ...currentPerm,
        [field]: updatedVal
      }
    };

    if (field === 'writable' && updatedVal) {
      updated[module].visible = true;
    }

    setNewPermissions(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Messages */}
      {error && (
        <div style={{
          background: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.25)',
          padding: '12px 20px', borderRadius: '12px', color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div style={{
          background: 'rgba(48, 209, 88, 0.1)', border: '1px solid rgba(48, 209, 88, 0.25)',
          padding: '12px 20px', borderRadius: '12px', color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <i className="fas fa-check-circle"></i>
          <span>{success}</span>
        </div>
      )}

      {/* Header and Add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: 600 }}><i className="fas fa-users-cog"></i> Configuración de Usuarios</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>Crea, edita y administra los permisos y roles de los usuarios del sistema.</p>
        </div>
        {!showAddForm && !editingUser && !resetPasswordUser && (
          <button className="btn-primary" onClick={() => setShowAddForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px' }}>
            <i className="fas fa-user-plus"></i> Crear Usuario
          </button>
        )}
      </div>

      {/* CREATE NEW USER FORM */}
      {showAddForm && (
        <div className="glass-card" style={{ padding: '24px', background: 'rgba(255, 255, 255, 0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent-color)' }}><i className="fas fa-user-plus"></i> Nuevo Usuario</h4>
            <button className="close-modal" onClick={() => setShowAddForm(false)} style={{ width: '32px', height: '32px' }}><i className="fas fa-times"></i></button>
          </div>
          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Usuario (Login)</label>
                <input type="text" className="glass-input" placeholder="ej: Juan" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Nombre a Mostrar</label>
                <input type="text" className="glass-input" placeholder="ej: Juan Pérez" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Contraseña (mínimo 5 chars)</label>
                <input type="password" className="glass-input" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Rol</label>
                <select className="glass-select" value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                  <option value="custom">Usuario Personalizado</option>
                  <option value="admin">Administrador completo</option>
                </select>
              </div>
            </div>

            {newRole === 'custom' && (
              <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '8px' }}>
                <h5 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>Configurar Permisos por Módulo</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* Permissions for dashboard */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Cuentas Corrientes</span>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newPermissions.dashboard.visible} onChange={() => handleNewPermissionToggle('dashboard', 'visible')} />
                        Ver
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newPermissions.dashboard.writable} onChange={() => handleNewPermissionToggle('dashboard', 'writable')} />
                        Modificar
                      </label>
                    </div>
                  </div>

                  {/* Permissions for stock */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Vencimientos Stock</span>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newPermissions.stockExpiration.visible} onChange={() => handleNewPermissionToggle('stockExpiration', 'visible')} />
                        Ver
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newPermissions.stockExpiration.writable} onChange={() => handleNewPermissionToggle('stockExpiration', 'writable')} />
                        Modificar
                      </label>
                    </div>
                  </div>

                  {/* Permissions for usersManagement */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Configuración de Usuarios</span>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newPermissions.usersManagement.visible} onChange={() => handleNewPermissionToggle('usersManagement', 'visible')} />
                        Ver
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newPermissions.usersManagement.writable} onChange={() => handleNewPermissionToggle('usersManagement', 'writable')} />
                        Modificar
                      </label>
                    </div>
                  </div>

                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="button" className="btn-icon" onClick={() => setShowAddForm(false)} style={{ width: 'auto', padding: '10px 20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>Cancelar</button>
              <button type="submit" className="btn-primary" style={{ padding: '10px 24px' }}>Crear Usuario</button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT USER PERMISSIONS FORM */}
      {editingUser && (
        <div className="glass-card" style={{ padding: '24px', background: 'rgba(255, 255, 255, 0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--purple-color)' }}><i className="fas fa-edit"></i> Editar Permisos: {editingUser.displayName} (@{editingUser.username})</h4>
            <button className="close-modal" onClick={() => setEditingUser(null)} style={{ width: '32px', height: '32px' }}><i className="fas fa-times"></i></button>
          </div>
          <form onSubmit={handleUpdatePermissions} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '240px' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Rol del Usuario</label>
                <select className="glass-select" value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as any })}>
                  <option value="custom">Usuario Personalizado</option>
                  <option value="admin">Administrador completo</option>
                </select>
              </div>
            </div>

            {editingUser.role === 'custom' && (
              <div style={{ background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '8px' }}>
                <h5 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>Configurar Permisos por Módulo</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* Dashboard */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Cuentas Corrientes</span>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={editingUser.permissions.dashboard.visible} onChange={() => handlePermissionToggle('dashboard', 'visible')} />
                        Ver
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={editingUser.permissions.dashboard.writable} onChange={() => handlePermissionToggle('dashboard', 'writable')} />
                        Modificar
                      </label>
                    </div>
                  </div>

                  {/* Stock */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Vencimientos Stock</span>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={editingUser.permissions.stockExpiration.visible} onChange={() => handlePermissionToggle('stockExpiration', 'visible')} />
                        Ver
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={editingUser.permissions.stockExpiration.writable} onChange={() => handlePermissionToggle('stockExpiration', 'writable')} />
                        Modificar
                      </label>
                    </div>
                  </div>

                  {/* User management */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Configuración de Usuarios</span>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={editingUser.permissions.usersManagement.visible} onChange={() => handlePermissionToggle('usersManagement', 'visible')} />
                        Ver
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={editingUser.permissions.usersManagement.writable} onChange={() => handlePermissionToggle('usersManagement', 'writable')} />
                        Modificar
                      </label>
                    </div>
                  </div>

                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="button" className="btn-icon" onClick={() => setEditingUser(null)} style={{ width: 'auto', padding: '10px 20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>Cancelar</button>
              <button type="submit" className="btn-primary" style={{ padding: '10px 24px', background: 'var(--purple-color)', boxShadow: '0 4px 12px rgba(191, 90, 242, 0.3)' }}>Guardar Cambios</button>
            </div>
          </form>
        </div>
      )}

      {/* RESET PASSWORD FORM */}
      {resetPasswordUser && (
        <div className="glass-card" style={{ padding: '24px', background: 'rgba(255, 255, 255, 0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--purple-color)' }}><i className="fas fa-key"></i> Restablecer Contraseña: {resetPasswordUser.displayName}</h4>
            <button className="close-modal" onClick={() => setResetPasswordUser(null)} style={{ width: '32px', height: '32px' }}><i className="fas fa-times"></i></button>
          </div>
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>Nueva Contraseña (mínimo 5 chars)</label>
              <input type="password" className="glass-input" placeholder="••••••••" value={newPasswordVal} onChange={(e) => setNewPasswordVal(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="button" className="btn-icon" onClick={() => setResetPasswordUser(null)} style={{ width: 'auto', padding: '10px 20px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>Cancelar</button>
              <button type="submit" className="btn-primary" style={{ padding: '10px 24px', background: 'var(--purple-color)' }}>Actualizar Contraseña</button>
            </div>
          </form>
        </div>
      )}

      {/* USERS LIST TABLE */}
      <div className="data-section glass-card" style={{ padding: '24px', marginTop: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '40px' }}>
            <i className="fas fa-circle-notch fa-spin" style={{ fontSize: '28px', color: 'var(--accent-color)' }}></i>
            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Cargando usuarios...</span>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre completo</th>
                  <th>Rol</th>
                  <th>Permisos de Módulos</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isSelf = currentUser?.username.toLowerCase() === u.username.toLowerCase();
                  return (
                    <tr key={u.username}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600 }}>{u.username}</span>
                          {isSelf && <span className="badge" style={{ background: 'rgba(10, 132, 255, 0.12)', color: 'var(--accent-color)', fontSize: '9px', padding: '2px 6px' }}>Tú</span>}
                        </div>
                      </td>
                      <td>{u.displayName}</td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'bg-red text-white' : 'bg-blue text-white'}`} style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                          {u.role === 'admin' ? 'Administrador' : 'Personalizado'}
                        </span>
                      </td>
                      <td>
                        {u.role === 'admin' ? (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Acceso total e irrestricto</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {u.permissions.dashboard.visible && (
                              <span className="badge" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                Cuentas: {u.permissions.dashboard.writable ? 'Escritura' : 'Lectura'}
                              </span>
                            )}
                            {u.permissions.stockExpiration.visible && (
                              <span className="badge" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                Stock: {u.permissions.stockExpiration.writable ? 'Escritura' : 'Lectura'}
                              </span>
                            )}
                            {u.permissions.usersManagement.visible && (
                              <span className="badge" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                Configuración: {u.permissions.usersManagement.writable ? 'Escritura' : 'Lectura'}
                              </span>
                            )}
                            {!u.permissions.dashboard.visible && !u.permissions.stockExpiration.visible && !u.permissions.usersManagement.visible && (
                              <span className="badge" style={{ fontSize: '10px', background: 'rgba(255, 69, 58, 0.1)', color: 'var(--danger-color)', border: '1px solid rgba(255, 69, 58, 0.15)' }}>
                                Sin acceso
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button className="btn-icon" title="Editar Permisos" onClick={() => { setEditingUser(u); setResetPasswordUser(null); setShowAddForm(false); }} style={{ background: 'rgba(191,90,242,0.1)', color: 'var(--purple-color)' }}>
                            <i className="fas fa-edit"></i>
                          </button>
                          <button className="btn-icon" title="Restablecer Contraseña" onClick={() => { setResetPasswordUser(u); setEditingUser(null); setShowAddForm(false); }} style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                            <i className="fas fa-key"></i>
                          </button>
                          <button className="btn-icon" title="Eliminar Usuario" onClick={() => handleDeleteUser(u.username)} disabled={isSelf} style={isSelf ? { opacity: 0.3, cursor: 'not-allowed', background: 'rgba(255,255,255,0.05)', color: 'gray' } : { background: 'rgba(255,69,58,0.1)', color: 'var(--danger-color)' }}>
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
